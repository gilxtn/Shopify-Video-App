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
  if (filters?.tag) filterParts.push(`tag:${filters.tag}`);

  if (Array.isArray(filters?.vendor) && filters.vendor.length > 0) {
    const vendorFilters = filters.vendor
      .map((v) => `vendor:${v}`)
      .join(" OR ");
    filterParts.push(`(${vendorFilters})`);
  }
  // if (filters?.category) {
  //   const categoryId = filters?.category?.split("/").pop();
  //   filterParts.push(`category_id:${categoryId}`);
  // }
  if (Array.isArray(filters?.category) && filters.category.length > 0) {
    const categoryFilters = filters.category
      .map((c) => `category_id:${c.split("/").pop()}`)
      .join(" OR ");
    filterParts.push(`(${categoryFilters})`);
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
            otherVideos: metafield(namespace: "custom", key: "youtube_videos_list") {
              value
            }
            totalInventory
            tracksInventory
            variantsCount {
              count
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
   // Convert Shopify node IDs to BigInt
  const arrId = json.data.products.edges.map((edge) => BigInt(edge.node.id?.split("/").pop()));

  // Fetch all extended info for these products
  const productExtendedInfo = await prisma.productExtendedInfo.findMany({
    where: { productId: { in: arrId }, shop: session.shop },
  });

  // Attach all rows of extended info to each product
  const edgesWithExtendedInfo = json.data.products.edges.map((edge) => {
    const productId = BigInt(edge.node.id?.split("/").pop());
    const extendedInfoRows = productExtendedInfo
      .filter((info) => info.productId === productId)
      .map((row) => ({
        ...row,
        productId: row.productId.toString(),
        id: row.id.toString(),
      }));

    return {
      ...edge,
      node: {
        ...edge.node,
        extendedInfo: extendedInfoRows,
      },
    };
  });

  const responseData = {
    ...json.data.products,
    edges: edgesWithExtendedInfo,
  };

  // Use replacer to serialize any remaining BigInt safely
  return new Response(JSON.stringify(responseData, (key, value) =>
    typeof value === "bigint" ? value.toString() : value
  ), {
    headers: { "Content-Type": "application/json" },
  });
};