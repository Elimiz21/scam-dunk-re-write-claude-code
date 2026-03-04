import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ScamDunk Blog Post";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

type PageParams = { slug: string };

export async function generateImageMetadata({ params }: { params: PageParams }) {
  return [
    {
      contentType: "image/png",
      size: { width: 1200, height: 630 },
      alt: "ScamDunk Blog Post",
    },
  ];
}

export default async function Image({ params }: { params: PageParams }) {
  const slug = decodeURIComponent(params.slug);

  // Fetch post title if possible
  let postTitle = "ScamDunk Blog - Detect Stock Scams";

  try {
    if (process.env.DATABASE_URL) {
      const { prisma } = await import("@/lib/db");
      const post = await prisma.blogPost.findFirst({
        where: { slug, isPublished: true },
        select: { title: true },
      });
      if (post) {
        postTitle = post.title;
      }
    }
  } catch (error) {
    console.error("Failed to fetch post title for OG image:", error);
  }

  // Truncate title if too long
  const displayTitle = postTitle.length > 60 ? postTitle.substring(0, 57) + "..." : postTitle;

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 48,
          background: "linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "white",
          padding: "60px 40px",
          gap: "30px",
        }}
      >
        {/* Small ScamDunk badge */}
        <div
          style={{
            fontSize: 24,
            color: "rgba(255, 255, 255, 0.7)",
            textTransform: "uppercase",
            letterSpacing: "2px",
          }}
        >
          ScamDunk Blog
        </div>

        {/* Post title */}
        <div
          style={{
            fontSize: 56,
            fontWeight: "bold",
            textAlign: "center",
            lineHeight: "1.2",
            maxWidth: "90%",
          }}
        >
          {displayTitle}
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: "rgba(255, 255, 255, 0.6)",
            textAlign: "center",
          }}
        >
          Investment fraud detection and analysis
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
