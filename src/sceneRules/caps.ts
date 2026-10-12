// Five thousand items in one scene.
export const maxItems = 5000;
// Ten thousand points in one item, including polygon holes.
export const maxPoints = 10000;
// Ten thousand characters in one text or label.
export const maxTextLength = 10000;
// Five hundred changes in one batch.
export const maxChanges = 500;
// Sixteen kibibytes of metadata, measured as UTF-8 JSON.
export const maxMetadataBytes = 16 * 1024;

// Grid lines range from one tenth to ten world units.
export const minGridLineWidth = 0.1;
export const maxGridLineWidth = 10;

// One hundred scenes in one room, with names up to one hundred characters.
export const maxScenes = 100;
export const maxSceneNameLength = 100;

// Two hundred live updates per connection per second; reliable ends are exempt.
export const maxLiveMessagesPerSecond = 200;
