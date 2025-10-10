import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const body = await request.json();
    const shop = session?.shop;
    const session_token = session?.accessToken;

    const params = new URLSearchParams();
    body.forEach((id) => {
      params.append("ids[]", id);
    });

    const test_apiUrl = `https://gileck.app.n8n.cloud/webhook-test/get-products?${params.toString()}`;
    const apiUrl = `https://gileck.app.n8n.cloud/webhook/get-products?${params.toString()}`;
    // const test2 = `https://gileck.app.n8n.cloud/webhook/get-products2?${params.toString()}`;
    // const test2_live = `https://gileck.app.n8n.cloud/webhook/get-products?${params.toString()}`;
    const test2_live = `https://gileck.app.n8n.cloud/webhook-test/get-products2?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: body,
        shop,
        accessToken: session_token,
      }),
    });

    const data = await response.json();
    console.log(data, "data--youtube----");
    if (!response.ok || data?.code === 404) {
      throw new Response(
        JSON.stringify({
          error: data.message || "Unknown error",
          ids: body,
          shop,
          accessToken: session_token,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const updateProducts = [];
    const erroredProducts = [];
    data.forEach(async (item) => {
      if (item.data.metafieldsSet?.userErrors?.length > 0) {
        erroredProducts.push(item.data.productUpdate?.product);
      } else {
        const videoUrl = item.data.metafieldsSet.metafields.find(
          (field) => field.key === "youtube_demo_video",
        );
        const aiSummary = item.data.metafieldsSet.metafields.find(
          (field) => field.key === "youtube_demo_summary",
        );
        const highlights = item.data.metafieldsSet.metafields.find(
          (field) => field.key === "youtube_demo_highlights",
        );
        item;
        const productId = item.data.productUpdate?.product?.id.split("/").pop();
        const productInfo = {
          shop: shop,
          productId: productId,
          productTitle: item.data.productUpdate?.product?.title,
          videoUrl: videoUrl?.value,
          source_method: "AUTO",
          aiSummary: aiSummary?.value,
          highlights: highlights?.value,
        };
        
    const existingTags = item.data.productUpdate?.product?.tags || [];

    if (!existingTags.includes("youtubevideo")) {
      try {
        await admin.graphql(`
          mutation {
            productUpdate(input: {
              id: "${item.data.productUpdate?.product?.id}",
              tags: ${JSON.stringify([...existingTags, "youtubevideo"])}
            }) {
              product {
                id
                tags
              }
              userErrors {
                field
                message
              }
            }
          }
        `);
      } catch (err) {
        console.error("Failed to add youtubevideo tag", err);
      }
    }
        
        updateProducts.push(productInfo);
        await prisma.ProductExtendedInfo.upsert({
          where: { productId: productInfo.productId },
          update: {
            productTitle: productInfo.productTitle,
            videoUrl: productInfo.videoUrl,
            source_method: productInfo.source_method,
            aiSummary: productInfo.aiSummary,
            highlights: productInfo.highlights,
            shop: productInfo.shop,
          },
          create: productInfo,
        });
      }
    });

    console.log(updateProducts, "updateProducts");
    console.log(erroredProducts, "erroredProducts");

    if (erroredProducts.length > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Partial success",
          data,
          erroredProducts,
          updateProducts,
        }),
        {
          status: 206,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        message: "All products updated successfully",
        data,
        updateProducts,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("error", error);
    return new Response(
      JSON.stringify({
        error: error?.message || "Unknown error",
        success: false,
      }),
      {
        status: error?.status || error?.statusCode || 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
