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
      "expo-router",
      "expo-font",
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
      [
        "expo-image-picker",
        {
          photosPermission:
            "Choose a photo for your rider card or a community post.",
          cameraPermission: false,
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
