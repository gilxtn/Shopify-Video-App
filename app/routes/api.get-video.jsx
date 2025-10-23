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
    const changedApiUrl = `https://gileck.app.n8n.cloud/webhook/get-products-test01?${params.toString()}`;

    const response = await fetch(changedApiUrl, {
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
    console.log(data, "data----------Webhook response");
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
      if (item?.data?.metafieldsSet?.userErrors?.length > 0) {
        erroredProducts.push(item.data.productUpdate?.product);
      } else {
        const videoUrl = item?.data?.metafieldsSet?.metafields.find(
          (field) => field.key === "youtube_demo_video",
        );
        const aiSummary = item?.data?.metafieldsSet?.metafields.find(
          (field) => field.key === "youtube_demo_summary",
        );
        const highlights = item?.data?.metafieldsSet?.metafields.find(
          (field) => field.key === "youtube_demo_highlights",
        );
        const otherVideosField = item?.data?.metafieldsSet?.metafields.find(
          (field) => field.key === "youtube_videos_list",
        );
        let otherVideos = [];
        if (otherVideosField?.value) {
          try {
            otherVideos = JSON.parse(otherVideosField.value);
          } catch (e) {
            console.error("Failed to parse otherVideos", e);
          }
        }
        item;
        const productId = item?.data?.productUpdate?.product?.id.split("/").pop();
        const productInfo = {
          shop: shop,
          productId: productId,
          productTitle: item?.data?.productUpdate?.product?.title,
          videoUrl: videoUrl?.value,
          source_method: "AUTO",
          aiSummary: aiSummary?.value,
          highlights: highlights?.value,
        };

      
    const existingTags = item.data.productUpdate?.product?.tags || [];
    console.log("existingTags", existingTags);
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
        // 1. Delete all old videos for this product + shop
        await prisma.productExtendedInfo.deleteMany({
          where: {
            productId: BigInt(productId),
            shop,
          },
        });

        // 2. Insert main video (true) from youtube_demo_video metafield
        await prisma.productExtendedInfo.create({
          data: {
            shop,
            productId: BigInt(productId),
            productTitle: item.data.productUpdate?.product?.title,
            videoUrl: videoUrl?.value,
            aiSummary: aiSummary?.value,
            highlights: highlights?.value,
            source_method: "AUTO",
            isMain: true,
          },
        });

        // 3. Insert other videos (false) from youtube_videos_list metafield
        for (const ov of otherVideos) {
          await prisma.productExtendedInfo.create({
            data: {
              shop,
              productId: BigInt(productId),
              productTitle: item.data.productUpdate?.product?.title,
              videoUrl: ov,
              source_method: "AUTO",
              isMain: false,
            },
          });
        }
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
        {status: 206, headers: { "Content-Type": "application/json" },},
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        message: "All products updated successfully",
        data,
        updateProducts,
      }),
      { status: 200, headers: { "Content-Type": "application/json" },},
    );
  } catch (error) {
    console.error("error", error);
    return new Response(
      JSON.stringify({
        error: error?.message || "Unknown error",
        success: false,
      }),
      {status: error?.status || error?.statusCode || 500,headers: { "Content-Type": "application/json" },},
    );
  }
};
