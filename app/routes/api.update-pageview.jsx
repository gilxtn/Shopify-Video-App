import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.public.appProxy(request);
    const shop = session.shop;
    const data = await request.json();
    const { productId, pageType, pageHandle } = data;

    if (!productId || !pageType) {
        return new Response("Invalid input", { status: 400 });
    }

  try {
    const result = await prisma.videoPageView.upsert({
      where: {
        shop_productId_pageType_pageHandle: {
          shop,
          productId: BigInt(productId),
          pageType,
          pageHandle: pageHandle || "",
        },
      },
      update: {
        viewCount: { increment: 1 },
      },
      create: {
        shop,
        productId: BigInt(productId),
        pageType,
        pageHandle: pageHandle || "",
        viewCount: 1,
      },
    });
    console.log( productId, pageType, pageHandle, "result----------");

    return new Response(JSON.stringify({ success: true, viewCount: result.viewCount }), { status: 200 });
  } catch (err) {
    console.error("Error updating page view:", err);
    return new Response("Server error", { status: 500 });
  }
};
