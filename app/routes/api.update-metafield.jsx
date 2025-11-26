import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { formatPrompt, youtubeSummaryPrompt } from "./utils/prompts";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  console.log(session, "session");

  const {
    productId,
    link,
    title,
    vendor,
    videoId,
    product_type,
    autoGenerateornot,
    summary,
    highlights,
  } = await request.json();

  const validUrl = await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
  );

  const normalizeUrl = (url) => {
    return url.replace("www.", ""); 
  };


  if (!validUrl.ok) {
    console.log("Invalid URL", validUrl.status);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Invalid YouTube URL or video is not embeddable.",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 400,
      },
    );
  } else {
    let finalSummary ;
    let finalHighlights;
    const output = await validUrl.json();
    if (output) {
      const url = `https://youtube.com/embed/${videoId}`;
      if (autoGenerateornot === "manual" && (!summary || !highlights)) {
        finalSummary = "";
        finalHighlights = "[]";
        console.log("Manual mode no summary/highlights provided skipping generation");
      } else  if (summary && highlights) {
        finalSummary = summary;
        finalHighlights = JSON.stringify(highlights);
        console.log("✅ Using provided summary/highlights, skipping API call");
      }else{
        try{
          const getsummary = await getVideoSummary({
            youtube_url: link,
            title,
            vendor,
            product_type,
          });
          const result = getsummary?.choices[0]?.message?.content;
          const summaryData = JSON.parse(result);
          finalSummary = summaryData?.summary;
          finalHighlights = JSON.stringify(summaryData?.highlights);
          console.log("finalSummary", finalSummary);
          console.log("finalHighlights", finalHighlights);
        } catch (err) {
          console.error("getVideoSummary failed", err.message);
          return new Response(
            JSON.stringify({
              success: false,
              message: "Failed to generate video summary",
            }),
            { headers: { "Content-Type": "application/json" }, status: 500 },
          );
        }
      }
      // if (autoGenerateornot === "auto") {
      // try {
      //   const getsummary = await getVideoSummary({
      //     youtube_url: link,
      //     title,
      //     vendor,
      //     product_type,
      //   });
      //   const result = getsummary?.choices[0]?.message?.content;
      //   const summaryData = JSON.parse(result);
      //   finalSummary = summaryData?.summary;
      //   finalHighlights = JSON.stringify(summaryData?.highlights);
      //   console.log("finalSummary", finalSummary);
      //   console.log("finalHighlights", finalHighlights);
      // } catch (err) {
      //   console.error("getVideoSummary failed", err.message);
      //   return new Response(
      //     JSON.stringify({
      //       success: false,
      //       message: "Failed to generate video summary",
      //     }),
      //     { headers: { "Content-Type": "application/json" }, status: 500 },
      //   );
      // }
      try {
        const tagResponse = await admin.graphql(
          `#graphql
        query GetProductTags($id: ID!) {
          product(id: $id) {
            tags
          }
        }`,
          {
            variables: { id: productId },
          },
        );

        const tagdata = await tagResponse.json();
        const existingTags = tagdata?.data?.product?.tags || [];

        // Check if "youtubevideo" tag already exists
        const tagExists = existingTags.some(
          (tag) => tag.toLowerCase() === "youtubevideo",
        );

        // Add the "youtubevideo" tag only if it doesn't already exist
        const updatedTags = tagExists
          ? existingTags
          : [...existingTags, "youtubevideo"];


        if (finalSummary === "") {
          await admin.graphql(`
            mutation DeleteSummary($metafields: [MetafieldIdentifierInput!]!) {
              metafieldsDelete(metafields: $metafields) {
                deletedMetafields {
                  key
                  namespace
                  ownerId
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `, {
            variables: {
              metafields: [
                {
                  ownerId: productId,
                  namespace: "custom",
                  key: "youtube_demo_summary"
                }
              ]
            }
          });
        }


        const response = await admin.graphql(
          `#graphql
        mutation UpdateProductMetafield($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              metafields(first: 10) {
                edges {
                  node {
                    key
                    namespace
                    value
                  }
                }
              }
              tags
            }
            userErrors {
              field
              message
            }
          }
        }`,
          {
            variables: {
              input: {
                id: productId,
                metafields: [
                  {
                    namespace: "custom",
                    key: "youtube_demo_video",
                    value: normalizeUrl(url),
                    type: "url",
                  },
                  {
                    namespace: "custom",
                    key: "youtube_demo_highlights",
                    value: finalHighlights,
                    type: "json",
                  },
                  {
                    namespace: "custom",
                    key: "youtube_demo_summary",
                    value: finalSummary || " ",
                    type: "multi_line_text_field",
                  },
                  {
                    namespace: "custom",
                    key: "video_source",
                    value: "MANUAL",
                    type: "single_line_text_field",
                  },
                ],
                tags: updatedTags,
              },
            },
          },
        );

        const data = await response.json();

        const errors = data?.data?.productUpdate?.userErrors || [];
        console.log(data?.data?.productUpdate,"data?.data?.productUpdate--")
        if (errors.length > 0) {
          console.error("Shopify userErrors:", errors);
          return new Response(
            JSON.stringify({ success: false, message: "Updated Successfully" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        const updatedMetafields =    data?.data?.productUpdate?.product?.metafields?.edges || [];
        
        await prisma.productExtendedInfo.updateMany({
          where: {
            productId: BigInt(productId.split("/").pop()),
            shop: session?.shop,
            isMain: true,
          },
          data: { isMain: false },
        });
        
        await prisma.productExtendedInfo.upsert({
          where: {
            productId_shop_videoUrl: {
              productId: BigInt(productId.split("/").pop()),
              shop: session?.shop,
              videoUrl: normalizeUrl(url),
            },
          },
          update: {
            productTitle: title,
            source_method: "MANUAL",
            aiSummary: finalSummary,
            highlights: finalHighlights,
            isMain: true,
          },
          create: {
            productId: BigInt(productId.split("/").pop()),
            productTitle: title,
            videoUrl: normalizeUrl(url),
            source_method: "MANUAL",
            aiSummary: finalSummary,
            highlights: finalHighlights,
            shop: session?.shop,
            isMain: true,
          },
        });

        // await prisma.ProductExtendedInfo.upsert({
        //   where: { productId: productId.split("/").pop() },
        //   update: {
        //     productTitle: title,
        //     videoUrl: url,
        //     source_method: "MANUAL",
        //     aiSummary: finalSummary,
        //     highlights: finalHighlights,
        //     shop: session?.shop,
        //   },
        //   create: {
        //     productId: productId.split("/").pop(),
        //     productTitle: title,
        //     videoUrl: url,
        //     source_method: "MANUAL",
        //     aiSummary: finalSummary,
        //     highlights: finalHighlights,
        //     shop: session?.shop,
        //   },
        // });
        return new Response(
          JSON.stringify({ success: true, message: "Updated Successfully" , data:data?.data?.productUpdate }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        console.error("Metafield update failed:", error.message);
        return new Response(
          JSON.stringify({ success: false, message: "Invalid Url" }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }
  }

  async function getVideoSummary({ youtube_url, title, vendor, product_type }) {
    const prompt = formatPrompt(youtubeSummaryPrompt, {
      youtube_url,
      title,
      vendor,
      product_type,
    });
    
    const body = {
      model: "sonar-pro",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    };

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Request failed: ${response.status} ${error}`);
    }

    const result = await response.json();
    return result;
  }
};
