Pod::Spec.new do |s|
  s.name           = 'RideLocation'
  s.version        = '1.0.0'
  s.summary        = 'Foreground Core Location samples for RideSpeed'
  s.description    = 'Local-only Expo module forwarding native location and speed accuracy.'
  s.author         = 'RideSpeed'
  s.homepage       = 'https://github.com/startupbydekkmitl001-pixel/ride-speed'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => 'https://github.com/startupbydekkmitl001-pixel/ride-speed.git' }
  s.static_framework = true
  s.swift_version  = '5.0'
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'CoreLocation', 'UIKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.swift'
end
