// mirror-helper: launches a fresh window of a given macOS app, moves it off
// (virtual) screen so it never visually covers the host Electron window, and
// mirrors its live contents as JPEG frames over stdout — a read-only preview
// tile. There's no public window-reparenting API on macOS, and no reliable
// way to deliver real keyboard/mouse input into a background window's actual
// focused control without making the whole app frontmost (which would also
// raise the user's other, on-screen windows of that app) — so this is
// intentionally view-only. To interact with the app, use its real window.
//
// Wire protocol
// ---------------------------------------------------------------------------
// stdout: a sequence of frames, each `[4-byte BE length][1-byte type][payload]`.
//   type 1 = JSON control message (UTF8), type 2 = raw JPEG bytes.
//   The very first message is always JSON: {"type":"ready","frame":{x,y,w,h},"scale":N}
//   frame is the window's real (offscreen) origin/size in points; scale is
//   the points-to-pixels factor.
//   On failure: {"type":"error","message":"..."} then the process exits.
// stdin: unused for input — its only purpose is EOF, which signals "close
//   this window" (see the read loop at the bottom of main).

import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import ScreenCaptureKit

// MARK: - stdout framing

final class OutputWriter {
    private let handle = FileHandle.standardOutput
    private let lock = NSLock()

    func writeJSON(_ obj: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return }
        write(type: 1, payload: data)
    }

    func writeFrame(_ jpeg: Data) {
        write(type: 2, payload: jpeg)
    }

    private func write(type: UInt8, payload: Data) {
        lock.lock()
        defer { lock.unlock() }
        var lenBE = UInt32(payload.count).bigEndian
        var out = Data(bytes: &lenBE, count: 4)
        out.append(type)
        out.append(payload)
        handle.write(out)
    }
}

let out = OutputWriter()

func fail(_ message: String) -> Never {
    out.writeJSON(["type": "error", "message": message])
    exit(1)
}

// MARK: - window discovery helpers

struct FoundWindow {
    let windowID: CGWindowID
    let pid: pid_t
    let frame: CGRect
}

// Deliberately CGWindowList, not SCShareableContent, for discovery: window
// IDs/owner/bounds/layer here don't require Screen Recording permission
// (only the pixels do), it's a synchronous direct query of the window
// server's current state, and — unlike the async SCShareableContent call —
// it isn't at risk of returning a briefly-stale snapshot across a tight
// 200ms poll loop, which was previously making a genuinely-new window look
// like it never appeared.
func liveWindows(bundleId: String) -> [FoundWindow] {
    let pids = Set(
        NSWorkspace.shared.runningApplications
            .filter { $0.bundleIdentifier == bundleId }
            .map { $0.processIdentifier }
    )
    guard !pids.isEmpty,
        let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]]
    else { return [] }

    return list.compactMap { info in
        guard let ownerPID = info[kCGWindowOwnerPID as String] as? Int32, pids.contains(ownerPID) else { return nil }
        guard let layer = info[kCGWindowLayer as String] as? Int, layer == 0 else { return nil }
        guard let number = info[kCGWindowNumber as String] as? Int else { return nil }
        guard let boundsDict = info[kCGWindowBounds as String] as? NSDictionary,
            let frame = CGRect(dictionaryRepresentation: boundsDict)
        else { return nil }
        return FoundWindow(windowID: CGWindowID(number), pid: ownerPID, frame: frame)
    }
}

// Finds the AX window element for a given process whose current on-screen
// frame matches `bounds` — there's no public API to go directly from a
// CGWindowID/SCWindow to an AXUIElement, so we match by geometry instead,
// which is reliable immediately after launch (before anything's been moved).
func axWindowElement(pid: pid_t, matchingBounds bounds: CGRect) -> AXUIElement? {
    let appElement = AXUIElementCreateApplication(pid)
    var windowsRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef) == .success,
        let windows = windowsRef as? [AXUIElement]
    else { return nil }

    for window in windows {
        var posRef: CFTypeRef?
        var sizeRef: CFTypeRef?
        // Explicit CFTypeID checks (not `as!`) on purpose — a malformed or
        // unexpected attribute value here must be skipped, not crash the
        // whole helper process before it has a chance to report anything
        // useful (Swift statically allows `as? AXValue` to "succeed" on any
        // CFTypeRef, so that cast alone can't catch a mismatch).
        guard AXUIElementCopyAttributeValue(window, kAXPositionAttribute as CFString, &posRef) == .success,
            AXUIElementCopyAttributeValue(window, kAXSizeAttribute as CFString, &sizeRef) == .success,
            let posRef, CFGetTypeID(posRef) == AXValueGetTypeID(),
            let sizeRef, CFGetTypeID(sizeRef) == AXValueGetTypeID()
        else { continue }
        let posValue = posRef as! AXValue
        let sizeValue = sizeRef as! AXValue
        var pos = CGPoint.zero
        var size = CGSize.zero
        guard AXValueGetValue(posValue, .cgPoint, &pos),
            AXValueGetValue(sizeValue, .cgSize, &size)
        else { continue }
        let frame = CGRect(origin: pos, size: size)
        if abs(frame.origin.x - bounds.origin.x) < 2, abs(frame.origin.y - bounds.origin.y) < 2,
            abs(frame.size.width - bounds.size.width) < 2, abs(frame.size.height - bounds.size.height) < 2
        {
            return window
        }
    }
    return windows.first
}

func axSetPosition(_ window: AXUIElement, _ point: CGPoint) {
    var p = point
    if let value = AXValueCreate(.cgPoint, &p) {
        AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, value)
    }
}

// MARK: - input -> CGEvent

// MARK: - capture

final class FrameOutput: NSObject, SCStreamOutput {
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid,
            let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
        else { return }
        let ciImage = CIImage(cvImageBuffer: imageBuffer)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return }
        let rep = NSBitmapImageRep(cgImage: cgImage)
        guard let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.55]) else { return }
        out.writeFrame(jpeg)
    }
}

final class StreamDelegate: NSObject, SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        out.writeJSON(["type": "error", "message": "capture-stopped: \(error.localizedDescription)"])
        exit(1)
    }
}

// MARK: - entry point

@main
struct MirrorHelper {
    static func main() async {
        let args = CommandLine.arguments
        guard let appFlag = args.firstIndex(of: "--app"), appFlag + 1 < args.count else {
            fail("missing --app argument")
        }
        let bundleId = args[appFlag + 1]

        // Proactively show the Accessibility consent dialog if not yet
        // decided, rather than silently failing when we try to move/click
        // the target window.
        let axOptions = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        guard AXIsProcessTrustedWithOptions(axOptions) else {
            fail("accessibility-permission-denied")
        }

        // Checked explicitly and up front: without this, SCShareableContent
        // below just silently returns an empty window list forever, which
        // would otherwise surface as a confusing "window not found" instead
        // of the actual cause.
        if !CGPreflightScreenCaptureAccess() {
            _ = CGRequestScreenCaptureAccess()  // shows the consent dialog if not yet decided
            fail("screen-recording-permission-denied")
        }

        guard let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) else {
            fail("app-not-installed")
        }

        let before = Set(liveWindows(bundleId: bundleId).map { $0.windowID })
        let alreadyRunning = !NSWorkspace.shared.runningApplications
            .filter { $0.bundleIdentifier == bundleId }.isEmpty

        // Launching via NSWorkspace with a plain "--new-window" argv only
        // ever reaches Electron's generic single-instance forwarding, which
        // VS Code's app layer doesn't wire up to actually open a new window
        // (confirmed: it's silently a no-op against an already-running
        // instance). VS Code instead expects that request over its own CLI
        // protocol — replicate what Contents/Resources/app/bin/code does:
        // run the app's own Electron binary in Node-CLI mode against its
        // bundled cli.js, which does speak that protocol.
        let cliPath = appURL.appendingPathComponent("Contents/Resources/app/out/cli.js")
        let electronBinary = appURL.appendingPathComponent("Contents/MacOS/Code")
        let launchOk: Bool
        if alreadyRunning, FileManager.default.fileExists(atPath: cliPath.path) {
            let proc = Process()
            proc.executableURL = electronBinary
            proc.arguments = [cliPath.path, "--new-window"]
            proc.environment = (ProcessInfo.processInfo.environment).merging(
                ["ELECTRON_RUN_AS_NODE": "1"], uniquingKeysWith: { _, new in new }
            )
            launchOk = (try? proc.run()) != nil
        } else {
            // Cold start (app not running yet): there's no running instance
            // to hand a CLI request to, so a normal launch is correct here —
            // its first window is the one we want anyway.
            let config = NSWorkspace.OpenConfiguration()
            config.activates = false
            config.hides = false
            launchOk = await withCheckedContinuation { cont in
                NSWorkspace.shared.openApplication(at: appURL, configuration: config) { _, error in
                    cont.resume(returning: error == nil)
                }
            }
        }
        guard launchOk else { fail("launch-failed") }

        // A cold-launched, extension-loading editor can take a while to put
        // its first window up — 40 * 200ms (8s) was cutting that too close.
        var found: FoundWindow?
        for _ in 0..<100 {
            try? await Task.sleep(nanoseconds: 200_000_000)
            let current = liveWindows(bundleId: bundleId)
            if let fresh = current.first(where: { !before.contains($0.windowID) }) {
                found = fresh
                break
            }
            // First-ever window for an app that wasn't running yet won't be
            // "new" relative to an empty `before` set in a meaningful way —
            // any window at all is our target in that case.
            if before.isEmpty, let any = current.first {
                found = any
                break
            }
        }
        guard let target = found else {
            let pidCount = NSWorkspace.shared.runningApplications.filter { $0.bundleIdentifier == bundleId }.count
            let windowCount = liveWindows(bundleId: bundleId).count
            fail("window-not-found (running=\(pidCount) windows=\(windowCount) before=\(before.count))")
        }

        guard let axWindow = axWindowElement(pid: target.pid, matchingBounds: target.frame) else {
            fail("window-not-controllable")
        }

        // Move it to a spot far outside any real display so it never visibly
        // covers the host app — its content keeps compositing normally and
        // ScreenCaptureKit keeps capturing it regardless of on-screen position.
        let offscreenOrigin = CGPoint(x: 6000, y: 6000)
        axSetPosition(axWindow, offscreenOrigin)
        let realFrame = CGRect(origin: offscreenOrigin, size: target.frame.size)

        // Restore the window to wherever macOS originally placed it when it
        // first opened, rather than some arbitrary fixed spot.
        let originalOrigin = target.frame.origin
        func cleanupAndExit() -> Never {
            axSetPosition(axWindow, originalOrigin)
            exit(0)
        }

        let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        sigterm.setEventHandler { cleanupAndExit() }
        sigterm.resume()
        signal(SIGTERM, SIG_IGN)
        let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
        sigint.setEventHandler { cleanupAndExit() }
        sigint.resume()
        signal(SIGINT, SIG_IGN)

        // SCShareableContent's window-geometry snapshot can lag the window
        // server right after a move by a variable amount — handing SCStream
        // a filter whose bounds don't match reality yet gets rejected as an
        // invalid parameter. Re-fetching content and rebuilding the stream
        // from scratch each attempt (not just delaying once) is what
        // actually clears it reliably.
        let frameOutput = FrameOutput()
        var startedStream: SCStream?
        var startedScale: Double = 1
        var lastError: String = "unknown"
        for attempt in 0..<8 {
            if attempt > 0 { try? await Task.sleep(nanoseconds: 250_000_000) }
            guard let content = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false),
                let scWindow = content.windows.first(where: { $0.windowID == target.windowID })
            else {
                lastError = "screen-recording-permission-denied"
                continue
            }
            let filter = SCContentFilter(desktopIndependentWindow: scWindow)
            let scale = max(1, Double(filter.pointPixelScale))
            let streamConfig = SCStreamConfiguration()
            streamConfig.width = Int(realFrame.width * scale)
            streamConfig.height = Int(realFrame.height * scale)
            streamConfig.minimumFrameInterval = CMTime(value: 1, timescale: 12)
            streamConfig.showsCursor = true
            streamConfig.scalesToFit = true
            streamConfig.pixelFormat = kCVPixelFormatType_32BGRA

            let streamDelegate = StreamDelegate()
            let stream = SCStream(filter: filter, configuration: streamConfig, delegate: streamDelegate)
            do {
                try stream.addStreamOutput(frameOutput, type: .screen, sampleHandlerQueue: DispatchQueue(label: "mirror-helper.frames"))
                try await stream.startCapture()
                startedStream = stream
                startedScale = scale
                break
            } catch {
                lastError = error.localizedDescription
            }
        }
        guard startedStream != nil else {
            fail("capture-start-failed: \(lastError)")
        }

        out.writeJSON([
            "type": "ready",
            "frame": ["x": realFrame.origin.x, "y": realFrame.origin.y, "w": realFrame.width, "h": realFrame.height],
            "scale": startedScale
        ])

        let stdinQueue = DispatchQueue(label: "mirror-helper.stdin")
        // stdin's only purpose is EOF: the host closes it to signal "close
        // this window" (there's nothing to read otherwise — see header).
        // Raw read(2) rather than FileHandle.availableData: the latter
        // throws an uncaught NSException (crashing the whole process, taking
        // the live video stream down with it) on a transient error like
        // EAGAIN/EINTR instead of just retrying, which is a real condition a
        // long-lived pipe can hit.
        stdinQueue.async {
            var buf = [UInt8](repeating: 0, count: 256)
            while true {
                let n = read(0, &buf, buf.count)
                if n == 0 { break }  // EOF — host closed our stdin
                if n < 0 {
                    if errno == EINTR || errno == EAGAIN { continue }
                    break  // unexpected error — treat like EOF, close this window
                }
                // else: discarded — no input protocol anymore
            }
            DispatchQueue.main.async { cleanupAndExit() }
        }

        // Keep the process (and its run loop, needed for the signal sources
        // and the stream's internal dispatch machinery) alive indefinitely.
        while true {
            try? await Task.sleep(nanoseconds: 3_600_000_000_000)
        }
    }
}
