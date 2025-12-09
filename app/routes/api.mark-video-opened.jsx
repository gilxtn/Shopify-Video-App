import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop;

    if (!shop) {
      return json(
        { success: false, error: "Shop not found in session" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { productId, extendedInfoId, videoUrl } = body;

    if (!productId || !extendedInfoId || !videoUrl) {
      return json(
        {
          success: false,
          error: "productId, extendedInfoId and videoUrl are required",
        },
        { status: 400 },
      );
    }

    let numericProductId;
    let numericExtendedInfoId;

    try {
      numericProductId = BigInt(productId.toString());
      numericExtendedInfoId = Number(extendedInfoId);
    } catch (e) {
      return json(
        { success: false, error: "Invalid id format" },
        { status: 400 },
      );
    }
    const result = await prisma.productExtendedInfo.updateMany({
      where: {
        id: numericExtendedInfoId,
        shop,
        productId: numericProductId,
        videoUrl,
      },
      data: {
        isOpened: true,
      },
    });
    if (result.count === 0) {
      return json(
        {
          success: false,
          error: "No productExtendedInfo row found for given productId, extendedInfoId and videoUrl",
        },
        { status: 404 },
      );
    }

    return json(
      {
        success: true,
        updatedCount: result.count,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("mark-video-opened error:", error);
    return json(
      {
        success: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 },
    );
  }
};
