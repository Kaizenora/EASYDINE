// Contact points used across the marketing page. "Book a demo" opens a
// pre-filled email until there is a booking form.
export const CONTACT_EMAIL = "sgcreates18@gmail.com";
export const INSTAGRAM_HANDLE = "easydine._";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
export const DEMO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "EasyDine demo",
)}&body=${encodeURIComponent("Restaurant name:\nCity:\nNumber of tables:\nBest time to call:\n")}`;
