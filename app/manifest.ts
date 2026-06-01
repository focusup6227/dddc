import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dixon Doggy Day Care and Boarding",
    short_name: "DDDC",
    description:
      "Day care, boarding, and baths for Dixon's favorite dogs. Customer portal + operator + kiosk.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fafaf9",
    theme_color: "#a16207",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Kiosk",
        short_name: "Kiosk",
        description: "Front-of-house tablet view",
        url: "/kiosk",
      },
      {
        name: "Today",
        short_name: "Today",
        description: "Operator today view",
        url: "/staff",
      },
    ],
  };
}
