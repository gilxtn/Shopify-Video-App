// import { authenticate } from "../shopify.server";

// export const action = async ({ request }) => {
//   try {
//     const { admin, session } = await authenticate.admin(request);
//     const { productId, tags } = await request.json();

//     const updatedTags = tags.filter(
//       (tag) => tag.toLowerCase() !== "youtubevideo",
//     );

//     // Delete the YouTube video metafield
//     const deleteResponse = await admin.graphql(
//       `#graphql
//         mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
//           metafieldsDelete(metafields: $metafields) {
//             deletedMetafields {
//               key
//               namespace
//               ownerId
//             }
//             userErrors {
//               field
//               message
//             }
//           }
//         }`,
//       {
//         variables: {
//           metafields: [
//             {
//               key: "youtube_demo_video",
//               namespace: "custom",
//               ownerId: productId,
//             },
//             {
//               key: "video_source",
//               namespace: "custom",
//               ownerId: productId,
//             },
//             {
//               key: "youtube_demo_highlights",
//               namespace: "custom",
//               ownerId: productId,
//             },
//             {
//               key: "youtube_demo_summary",
//               namespace: "custom",
//               ownerId: productId,
//             },
//           ],
//         },
//       },
//     );

//     const deleteData = await deleteResponse.json();

//     if (deleteData.errors) {
//       console.error("Error deleting metafield:", deleteData.errors);
//       return new Response(
//         JSON.stringify({ success: false, errors: deleteData.errors }),
//         {
//           status: 500,
//           headers: { "Content-Type": "application/json" },
//         },
//       );
//     }

//     // Update product tags
//     const updateResponse = await admin.graphql(
//       `#graphql
//         mutation UpdateProductMetafield($input: ProductInput!) {
//           productUpdate(input: $input) {
//             product {
//               id
//               tags
//             }
//             userErrors {
//               field
//               message
//             }
//           }
//         }`,
//       {
//         variables: {
//           input: {
//             id: productId,
//             tags: updatedTags,
//           },
//         },
//       },
//     );

//     const updateData = await updateResponse.json();

//     if (
//       updateData.errors ||
//       updateData.data?.productUpdate?.userErrors?.length
//     ) {
//       console.error(
//         "Error updating product tags:",
//         updateData.errors || updateData.data.productUpdate.userErrors,
//       );
//       return new Response(
//         JSON.stringify({
//           success: false,
//           errors: updateData.errors || updateData.data.productUpdate.userErrors,
//         }),
//         {
//           status: 500,
//           headers: { "Content-Type": "application/json" },
//         },
//       );
//     }

//     return new Response(JSON.stringify({ success: true }), {
//       headers: { "Content-Type": "application/json" },
//     });
//   } catch (error) {
//     console.error("Unexpected error:", error);
//     return new Response(
//       JSON.stringify({ success: false, error: error.message }),
//       {
//         status: 500,
//         headers: { "Content-Type": "application/json" },
//       },
//     );
//   }
// };


import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const { productIds, productId } = await request.json();
    const ids = productIds || [productId];


for (const productId of ids) {
  const tagResp = await admin.graphql(`
    query {
      product(id: "${productId}") {
        tags
      }
    }
  `);
  const tagData = await tagResp.json();
  const currentTags = tagData.data.product.tags || [];

  // const updatedTags = currentTags.filter(
  //   t => t.toLowerCase() !== "youtubevideo"
  // );
    const updatedTags = currentTags.filter(
      (tag) => tag.toLowerCase() !== "youtubevideo",
    );

    // Delete the YouTube video metafield
    const deleteResponse = await admin.graphql(
      `#graphql
        mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
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
        }`,
      {
        variables: {
          metafields: [
            {
              key: "youtube_demo_video",
              namespace: "custom",
              ownerId: productId,
            },
            {
              key: "video_source",
              namespace: "custom",
              ownerId: productId,
            },
            {
              key: "youtube_demo_highlights",
              namespace: "custom",
              ownerId: productId,
            },
            {
              key: "youtube_demo_summary",
              namespace: "custom",
              ownerId: productId,
            },
          ],
        },
      },
    );

    const deleteData = await deleteResponse.json();

    if (deleteData.errors) {
      console.error("Error deleting metafield:", deleteData.errors);
      return new Response(
        JSON.stringify({ success: false, errors: deleteData.errors }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Update product tags
    const updateResponse = await admin.graphql(
      `#graphql
        mutation UpdateProductMetafield($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
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
            tags: updatedTags,
          },
        },
      },
    );

    const updateData = await updateResponse.json();

    if (
      updateData.errors ||
      updateData.data?.productUpdate?.userErrors?.length
    ) {
      console.error(
        "Error updating product tags:",
        updateData.errors || updateData.data.productUpdate.userErrors,
      );
      return new Response(
        JSON.stringify({
          success: false,
          errors: updateData.errors || updateData.data.productUpdate.userErrors,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
 });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
 }
};
