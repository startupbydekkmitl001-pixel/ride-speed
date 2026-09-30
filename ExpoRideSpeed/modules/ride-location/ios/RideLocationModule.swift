import CoreLocation
import ExpoModulesCore
import Foundation
import UIKit

public final class RideLocationModule: Module {
  // All controller access is confined to the main queue, including lifecycle cleanup.
  private var controller: RideLocationController?

  public func definition() -> ModuleDefinition {
    Name("RideLocation")
    Events("onSample", "onError")

    AsyncFunction("start") { () throws -> Void in
      if self.controller == nil {
        self.controller = RideLocationController { [weak self] event, payload in
          self?.sendEvent(event, payload)
        }
      }
      try self.controller?.start()
    }.runOnQueue(.main)

    AsyncFunction("stop") { () -> Void in
      self.controller?.stop()
    }.runOnQueue(.main)

    OnAppEntersBackground {
      self.onMain {
        self.controller?.stopForBackground()
      }
    }

    OnDestroy {
      self.onMain {
        self.controller?.stop()
        self.controller = nil
      }
    }

    OnAppContextDestroys {
      self.onMain {
        self.controller?.stop()
        self.controller = nil
      }
    }
  }

  private func onMain(_ body: @escaping () -> Void) {
    if Thread.isMainThread {
      body()
    } else {
      DispatchQueue.main.async(execute: body)
    }
  }
}

/** One foreground manager at a time; no background entitlement or permission prompts. */
private final class RideLocationController: NSObject, CLLocationManagerDelegate {
  private var manager: CLLocationManager?
  private let emit: (String, [String: Any?]) -> Void

  init(emit: @escaping (String, [String: Any?]) -> Void) {
    self.emit = emit
    super.init()
  }

  func start() throws {
    guard UIApplication.shared.applicationState != .background else {
      throw failure("E_BACKGROUND", "Foreground location capture cannot start in the background.")
    }
    // Repeated calls do not create another native watcher.
    guard manager == nil else { return }

    // A fresh manager per session lets identity checks reject delayed old callbacks.
    let next = CLLocationManager()
    guard next.authorizationStatus == .authorizedWhenInUse || next.authorizationStatus == .authorizedAlways else {
      throw failure("E_LOCATION_PERMISSION", "Foreground location permission is required.")
    }
    guard next.accuracyAuthorization == .fullAccuracy else {
      throw failure("E_PRECISE_LOCATION_REQUIRED", "Precise Location must be enabled in Settings.")
    }

    next.desiredAccuracy = kCLLocationAccuracyBestForNavigation
    next.distanceFilter = kCLDistanceFilterNone
    next.activityType = .automotiveNavigation
    next.pausesLocationUpdatesAutomatically = false
    next.allowsBackgroundLocationUpdates = false
    next.showsBackgroundLocationIndicator = false
    next.delegate = self
    manager = next
    next.startUpdatingLocation()
  }

  func stop() {
    let previous = manager
    // Clear identity before stopping so already queued callbacks cannot leak through.
    manager = nil
    previous?.delegate = nil
    previous?.stopUpdatingLocation()
  }

  func stopForBackground() {
    guard manager != nil else { return }
    stop()
    emitError("E_BACKGROUND", "Foreground location capture stopped when the app entered the background.", fatal: true)
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard manager === self.manager else { return }
    guard UIApplication.shared.applicationState != .background else {
      stopForBackground()
      return
    }
    guard authorizationIsValid(manager) else { return }

    // Core Location orders this batch oldest to newest. Do not drop all but the last.
    for location in locations {
      let source = location.sourceInformation
      emit("onSample", [
        // The evidence wire format uses integer milliseconds, derived only from CLLocation's time.
        "timestampMs": (location.timestamp.timeIntervalSince1970 * 1000.0).rounded(),
        "latitude": location.coordinate.latitude,
        "longitude": location.coordinate.longitude,
        "speedMps": location.speed,
        "horizontalAccuracyM": location.horizontalAccuracy,
        "speedAccuracyMps": location.speedAccuracy,
        "isSimulatedBySoftware": source?.isSimulatedBySoftware as Any? ?? NSNull(),
        "isProducedByAccessory": source?.isProducedByAccessory as Any? ?? NSNull()
      ])
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard manager === self.manager else { return }
    _ = authorizationIsValid(manager)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    guard manager === self.manager else { return }
    if let clError = error as? CLError, clError.code == .denied {
      stop()
      emitError("E_LOCATION_PERMISSION", error.localizedDescription, fatal: true)
      return
    }
    // Transient locationUnknown/network errors do not silently switch providers.
    emitError("E_LOCATION_UNAVAILABLE", error.localizedDescription, fatal: false)
  }

  @discardableResult
  private func authorizationIsValid(_ manager: CLLocationManager) -> Bool {
    guard manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways else {
      stop()
      emitError("E_LOCATION_PERMISSION", "Location permission was revoked.", fatal: true)
      return false
    }
    guard manager.accuracyAuthorization == .fullAccuracy else {
      stop()
      emitError("E_PRECISE_LOCATION_REQUIRED", "Precise Location is no longer enabled.", fatal: true)
      return false
    }
    return true
  }

  private func failure(_ code: String, _ message: String) -> Exception {
    Exception(name: "RideLocationException", description: message, code: code)
  }

  private func emitError(_ code: String, _ message: String, fatal: Bool) {
    emit("onError", ["code": code, "message": message, "fatal": fatal])
  }
}
