const { version } = require("./package.json");

module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT || "release";
  if (!["release", "development"].includes(variant)) {
    throw new Error("APP_VARIANT must be release or development.");
  }
  const development = variant === "development";
  const buildNumber = process.env.IOS_BUILD_NUMBER || "1.1.0";
  if (!/^[1-9]\d{0,3}\.\d{1,2}\.\d{1,2}$/.test(buildNumber)) {
    throw new Error(
      "IOS_BUILD_NUMBER must follow the Apple 4.2.2 digit format.",
    );
  }
  const permissions = require("./locales/en.json").ios;
  return {
    ...config,
    name: development ? "Ride Speed Dev" : "Ride Speed",
    version,
    scheme: development ? "ridespeed-dev" : "ridespeed",
    locales: {
      en: "./locales/en.json",
      th: "./locales/th.json",
    },
    plugins: [
      "@maplibre/maplibre-react-native",
      "expo-sqlite",
      ["expo-screen-orientation", { initialOrientation: "PORTRAIT_UP" }],
      "expo-router",
      "expo-font",
      "expo-asset",
      "expo-image",
      "expo-localization",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#000000",
          image: "./assets/icon.png",
          imageWidth: 96,
        },
      ],
      [
        "expo-video",
        { supportsBackgroundPlayback: false, supportsPictureInPicture: false },
      ],
      "expo-secure-store",
      "expo-web-browser",
      ["expo-camera", { microphonePermission: false, recordAudioAndroid: false, barcodeScannerEnabled: true }],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Choose a photo for your rider card or a community post.",
          // expo-camera owns the QR permission. Blocking CAMERA here would
          // remove that permission globally from Android's merged manifest.
          microphonePermission: false,
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            permissions.NSLocationWhenInUseUsageDescription,
          locationAlwaysPermission: false,
          locationAlwaysAndWhenInUsePermission: false,
          motionUsagePermission: false,
          isIosBackgroundLocationEnabled: false,
        },
      ],
      ...(development ? [["expo-dev-client", { launchMode: "launcher" }]] : []),
    ],
    userInterfaceStyle: "automatic",
    orientation: "default",
    android: {
      ...config.android,
      package: development ? "com.arnalxz.ridespeed.dev" : "com.arnalxz.ridespeed",
      versionCode: Number(buildNumber.split(".")[0]) * 10000 + Number(buildNumber.split(".")[1]) * 100 + Number(buildNumber.split(".")[2]),
    },
    web: { ...config.web, bundler: "metro" },
    ios: {
      ...config.ios,
      deploymentTarget: "17.0",
      bundleIdentifier: development
        ? "com.arnalxz.ridespeed.dev"
        : "com.arnalxz.ridespeed",
      buildNumber,
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleDevelopmentRegion: "en",
        CFBundleLocalizations: ["en", "th"],
        CADisableMinimumFrameDurationOnPhone: true,
        ...(development
          ? {
              NSLocalNetworkUsageDescription:
                permissions.NSLocalNetworkUsageDescription,
              NSBonjourServices: ["_expo._tcp"],
            }
          : {}),
      },
    },
    extra: { ...config.extra, buildVariant: variant },
  };
};
