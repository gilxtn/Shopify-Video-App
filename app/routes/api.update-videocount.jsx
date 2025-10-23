import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.public.appProxy(request);

  const data = await request.json();
  const { productId, videoUrl } = data;

  if (!productId || !videoUrl) {
    console.log("Invalid input:", { productId, videoUrl });
    return new Response("Invalid input", { status: 400 , productId:productId, videoUrl:videoUrl });
  }

  try {
    const result = await prisma.videoPlayCount.upsert({
      where: {
        productId_videoUrl: {
          productId: BigInt(productId),
          videoUrl,
        },
      },
      update: {
        playCount: {
          increment: 1,
        },
      },
      create: {
        productId: BigInt(productId),
        videoUrl,
        shop: session.shop,
        playCount: 1,
      },
    });
    
    // Add Activity log
    await prisma.activity.create({
      data: {
        shop: session.shop,
        productId: BigInt(productId),
        type: "VIDEO_PLAY",
        videoUrl,
      },
    });

    console.log(result, "result");
    return new Response(JSON.stringify({ success: true, playCount: result.playCount }), { status: 200 });
  } catch (error) {
    console.error("Error updating play count:", error);
    return new Response("Server error", { status: 500 });
  }
};
