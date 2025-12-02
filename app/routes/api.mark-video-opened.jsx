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
    const { productId } = body;

    if (!productId) {
      return json(
        { success: false, error: "productId is required" },
        { status: 400 },
      );
    }

    let numericId;
    try {
      // const numericId = BigInt(productId.split("/").pop());
      numericId = BigInt(productId.toString());
    } catch (e) {
      return json(
        { success: false, error: "Invalid productId format" },
        { status: 400 },
      );
    }
    const result = await prisma.productExtendedInfo.updateMany({
      where: {
        shop,
        productId: numericId,
      },
      data: {
        isOpened: true,
      },
    });
    if (result.count === 0) {
      return json(
        {
          success: false,
          error: "No productExtendedInfo row found for this product",
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
