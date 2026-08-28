export const APP_CONFIG = Object.freeze({
  publicSource: Object.freeze({
    owner: "archie0732",
    repo: "r7-favors",
    branch: "main",
    dataPath: "data/tools.json",
    thumbnailDirectory: "assets/thumbnails"
  }),
  privateSource: Object.freeze({
    owner: "YOUR_GITHUB_USERNAME",
    repo: "YOUR_PRIVATE_DATA_REPO",
    branch: "main",
    dataPath: "data/private-links.json",
    thumbnailDirectory: "assets/thumbnails"
  }),
  maxThumbnailBytes: 2 * 1024 * 1024,
  allowedThumbnailTypes: Object.freeze(["image/jpeg", "image/png", "image/webp"])
});
