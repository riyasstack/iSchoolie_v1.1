import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iSchoolie",
    short_name: "iSchoolie",
    start_url: "/home",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1839E8",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
