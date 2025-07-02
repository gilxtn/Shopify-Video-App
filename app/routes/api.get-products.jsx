import { collapseTextChangeRangesAcrossMultipleVersions } from "typescript";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const body = await request.json();

  const cursor = body?.cursor || null;
  const direction = body?.direction || "next";
  const query = body?.query || null;
  const sortKey = body?.sortKey || "CREATED_AT"; // Shopify expects enum values
  const reverse = body?.reverse ?? true;
  const filters = body?.filters || {};

  let filterParts = [];

  // if (query) filterParts.push(`title:*${query}*`);
  if (filters?.status) filterParts.push(`status:${filters.status}`);
  if (filters?.vendor) filterParts.push(`vendor:${filters.vendor}`);
  if (filters?.tag) filterParts.push(`tag:${filters.tag}`);

  if (filters?.category) {
    const categoryId = filters?.category?.split("/").pop();
    filterParts.push(`category_id:${categoryId}`);
  }
  if (filters?.demoVideo === "true") {
    filterParts.push(`tag:youtubevideo`);
  } else if (filters?.demoVideo === "false") {
    filterParts.push(`-tag:youtubevideo`);
  }

  const filterQuery = filterParts.join(" ");
  // console.log("filterQuery", filterQuery);

  const sortKeyMap = {
    title: "TITLE",
    vendor: "VENDOR",
    createdAt: "CREATED_AT",
    inventory: "INVENTORY_TOTAL",
  };

  const gqlSortKey = sortKeyMap[sortKey] || "CREATED_AT";

  const gqlQuery = `
    query GetProducts($cursor: String, $sortKey: ProductSortKeys, $reverse: Boolean, $query: String) {
      products(first: 10, after: $cursor, sortKey: $sortKey, reverse: $reverse, query: $query) {
        edges {
          cursor
          node {
            id
            title
            vendor
            status
            productType
            handle
            createdAt
            tags
            onlineStorePreviewUrl
            category {
              name
            }
            featuredImage {
              url
              altText
            }
            metafield(namespace: "custom", key: "youtube_demo_video") {
              value
            }
              summary: metafield(namespace: "custom", key: "youtube_demo_summary") {
              value
            }
            highlights: metafield(namespace: "custom", key: "youtube_demo_highlights") {
              value
            }
            video_source: metafield(namespace: "custom", key: "video_source") {
              value
            }
            variants(first: 1) {
              edges {
                node {
                  inventoryQuantity
                  inventoryItem {
                    tracked
                  }
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  const variables = {
    cursor,
    sortKey: gqlSortKey,
    reverse,
    query: [query, filterQuery].filter(Boolean).join(" "),
  };

  const res = await admin.graphql(gqlQuery, { variables });
  const json = await res.json();
  const arrId = json.data.products.edges.map((edge) =>
    edge.node.id?.split("/").pop(),
  );

  const productExtendedInfo = await prisma.productExtendedInfo.findMany({
    where: { productId: { in: arrId } },
  });

  const products = json.data.products.edges.map((edge) => {
    const extendedInfo = productExtendedInfo.find(
      (info) => info.productId == edge.node.id?.split("/").pop(),
    );
    return {
      ...edge.node,
      extendedInfo,
    };
  });
  // console.log("products", products);
  return new Response(JSON.stringify(json.data.products), {
    headers: { "Content-Type": "application/json" },
  });
};
