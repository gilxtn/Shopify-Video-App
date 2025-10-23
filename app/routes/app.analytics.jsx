import {
  Card,
  Page,
  Layout,
  Text,
  Box,
  InlineGrid,
  BlockStack,
  Icon,
  Badge,
  ProgressBar,
  InlineStack,
  Grid,
  DataTable,
  Thumbnail,
  Pagination,
  Link,
  Button,
  Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "@remix-run/react";
import { TitleBar, useAppBridge, Modal } from "@shopify/app-bridge-react";
import { ChartLineIcon, ViewIcon } from "@shopify/polaris-icons";
import prisma from "../db.server";
import { useEffect, useState } from "react";

export const loader = async ({ request }) => {
  const { admin ,session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const url = new URL(request.url);
  const timeFilter = url.searchParams.get("time") || "lastWeek";

  // --- Time filter logic
  let dateFilter = {};
  const now = new Date();
  if (timeFilter === "lastWeek") {
    dateFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
  } else if (timeFilter === "lastMonth") {
    dateFilter = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
  }

  // --- Fetch all activities for this shop within date range
  const activities = await prisma.activity.findMany({
    where: {
      shop: shopDomain,
      ...(timeFilter !== "all" ? { createdAt: dateFilter } : {}),
    },
  });

  // --- Aggregate data
  const playCounts = {};
  const pageViews = {};

  for (const act of activities) {
    const pid = act.productId?.toString();
    if (!pid) continue;
    if (act.type === "VIDEO_PLAY") {
      const key = `${pid}__${act.videoUrl}`;
      playCounts[key] = (playCounts[key] || 0) + 1;
    } else if (act.type === "PAGE_VIEW") {
      pageViews[pid] = (pageViews[pid] || 0) + 1;
    }
  }

  // --- Convert to arrays for rendering
  const videoStats = Object.entries(playCounts).map(([key, count]) => {
    const [productId, videoUrl] = key.split("__");
    return { productId: BigInt(productId), videoUrl, playCount: count };
  });

  const pageViewsArr = Object.entries(pageViews).map(([pid, count]) => ({
    productId: BigInt(pid),
    viewCount: count,
  }));

  //  const videoStats = await prisma.videoPlayCount.findMany({
  //   orderBy: { playCount: "desc" },
  //   });


  // let dateFilter = {};
  // if (timeFilter === "lastWeek") {
  //   dateFilter = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  // } else if (timeFilter === "lastMonth") {
  //   dateFilter = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  // }


//  const pageViews = await prisma.videoPageView.findMany({
//    where: {
//      shop: shopDomain,
//      pageType: "product",
//    }
//  });

  const extendedInfos = await prisma.productExtendedInfo.findMany({
    where: { shop: shopDomain },
  });

  // const allVideoTotals = videoStats.reduce((acc, video) => {
  //     const views = pageViews.find(v => v.productId === video.productId)?.viewCount || 0;
  //     acc.totalPlays += video.playCount;
  //     acc.totalViews += views;
  //     return acc;
  // }, { totalPlays: 0, totalViews: 0 });


  const allVideoTotals = videoStats.reduce(
    (acc, v) => {
      const views =  pageViewsArr.find((p) => p.productId === v.productId)?.viewCount || 0;
      acc.totalPlays += v.playCount;
      acc.totalViews += views;
      return acc;
    },
    { totalPlays: 0, totalViews: 0 },
  );


  const subscriptionResponse = await admin.graphql(`
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `);
  
  const subscriptionResult = await subscriptionResponse.json();
  const activeSubscriptions = subscriptionResult?.data?.currentAppInstallation?.activeSubscriptions || [];
  const hasActiveSubscription = activeSubscriptions.length > 0 && 
  activeSubscriptions.some(sub => sub.status === "ACTIVE");


  let count = 0;
  let hasNextPage = true;
  let cursor = null;
  const productIds = new Set();

  while (hasNextPage) {
    const query = `
      query getProducts($cursor: String) {
        products(first: 100, query: "tag:youtubevideo", after: $cursor) {
          pageInfo {
            hasNextPage
          }
          edges {
            cursor
            node {
              id
              title
              featuredMedia {
                preview {
                  image {
                    url
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: { cursor },
    });
    const result = await response.json();
    const edges = result.data.products.edges;
    count += edges.length;
    hasNextPage = result.data.products.pageInfo.hasNextPage;
    if (hasNextPage) {
      cursor = edges[edges.length - 1].cursor;
    }
    for (const edge of edges) {
      productIds.add(edge.node.id);
    }
  }

  // Fetch products WITHOUT youtubevideo tag or missing metafield
  let allHasNextPage = true;
  let allCursor = null;
  const noVideoProducts = [];

  while (allHasNextPage) {
    const allQuery = `
      query getAllProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage }
          edges {
            cursor
            node {
              id
              title
              tags
              onlineStorePreviewUrl
              featuredMedia {
                preview { image { url } }
              }
              metafield(key: "youtube_demo_video", namespace: "custom") {
                value
              }
            }
          }
        }
      }
    `;

    const allRes = await admin.graphql(allQuery, { variables: { cursor: allCursor } });
    const allJson = await allRes.json();
    const allEdges = allJson.data.products.edges;

    for (const edge of allEdges) {
      const node = edge.node;
      const hasTag = node.tags.includes("youtubevideo");
      const hasMeta = node.metafield?.value && node.metafield?.value.trim() !== "";
      if (!hasTag || !hasMeta) {
       const productId = node.id.replace("gid://shopify/Product/", "");
        noVideoProducts.push({
          id: node.id.replace("gid://shopify/Product/", ""),
          title: node.title,
          imageUrl: node.featuredMedia?.preview?.image?.url,
          onlineStorePreviewUrl: node.onlineStorePreviewUrl,
          pdpViews: pageViewsArr.find(v => v.productId.toString() === productId)?.viewCount || 0,
        });
      }
    }

    allHasNextPage = allJson.data.products.pageInfo.hasNextPage;
    if (allHasNextPage) {
      allCursor = allEdges[allEdges.length - 1].cursor;
    }
  }
  // Fetch products WITHOUT youtubevideo tag or missing metafield ENDS



  const products = [];
  for (const video of videoStats) {
    const gid = `gid://shopify/Product/${video.productId}`;
    const productQuery = `
      query {
        product(id: "${gid}") {
          id
          title
          onlineStorePreviewUrl
          featuredMedia {
            preview {
              image {
                url
              }
            }
          }
          metafield(key: "youtube_demo_summary", namespace: "custom") {
            value
          }
        }
      }
    `;
    const res = await admin.graphql(productQuery);
    const json = await res.json();
    const product = json.data.product;

    if (product) {
      const extended = extendedInfos.find(
        (info) =>
          info.productId === video.productId &&
          info.videoUrl === video.videoUrl
      );

      products.push({
        id: video.productId.toString(),
        title: product.title,
        onlineStorePreviewUrl : product.onlineStorePreviewUrl,
        imageUrl: product.featuredMedia?.preview?.image?.url,
        videoUrl: video.videoUrl,
        playCount: video.playCount,
        pdpViews: pageViews[video.productId?.toString()] || 0,
        playRate: (() => {
          const views = pageViewsArr.find(v => v.productId === video.productId)?.viewCount || 0;
          return views > 0 ? Math.round((video.playCount / views) * 100) : 0;
        })(),
        summary: extended?.aiSummary || product?.metafield?.value,
        highlights: extended?.highlights,
        sourceMethod: extended?.source_method,
        isMain: extended?.isMain,
        createdAt: extended?.createdAt,
      });
    }
  }

  return { count, products,hasActiveSubscription,shopDomain ,timeFilter, noVideoProducts, allVideoTotals   };
};



export default function Analytics() {
  const shopify = useAppBridge();
  useEffect(()=>{ shopify.loading(false); });
  const { count, products, hasActiveSubscription, shopDomain, timeFilter, noVideoProducts, allVideoTotals } = useLoaderData();
  const [modalProduct, setModalProduct] = useState(null);
  const [selectedTime, setSelectedTime] = useState(timeFilter);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  const topProduct = products[0];
  const paginatedProducts = products.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const totalPages = Math.ceil(products.length / pageSize);
  const handleBuyPlan = () => {
    if (shopDomain) {
      const shopName = shopDomain.replace(".myshopify.com", "");
        window.top.location.href = `https://admin.shopify.com/store/${shopName}/charges/autovid-test/pricing_plans`
    }
  }
  const handleSelectChange =(value)=>{
    console.log("Selected time:", value);
    setSelectedTime(value);
    const url = new URL(window.location.href);
    url.searchParams.set("time", value);
    window.location.href = url.toString(); 
  }
  return (
    hasActiveSubscription?(
    <Page title="Analytics" subtitle="Video Performance Analytics" fullWidth 
    primaryAction={ 
    <Select
      label="Date range"
      options={[
        {label: 'Last 7 days', value: 'lastWeek'},
        {label: 'Last 30 days', value: 'lastMonth'},
        {label: 'All Time', value: 'all'},
      ]}
      onChange={(value)=>handleSelectChange(value)}
      value={selectedTime}
    />}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            <InlineGrid columns={{ xs: "1fr", md: "1fr 1fr", lg: "1fr 1fr 1fr" }} gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyLg" tone="subdued">Plays ({selectedTime})</Text>
                  <Text variant="headingLg"> {products.reduce((sum,p)=>sum+p.playCount,0)}</Text>
                  <Text variant="bodyMd" tone="subdued"></Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyLg" tone="subdued">Play rate</Text>
                  <Text variant="headingLg">
                    {/* {(() => {
                       const totalViews = products.reduce((s,p)=>s+p.pdpViews,0);
                       const totalPlays = products.reduce((s,p)=>s+p.playCount,0);
                       return totalViews>0 ? Math.round((totalPlays/totalViews)*100) : 0;
                    })()}% */}
                    {allVideoTotals.totalViews > 0 ? Math.round((allVideoTotals.totalPlays / allVideoTotals.totalViews) * 100) : 0}%
                  </Text>
                  <Text variant="bodyMd" tone="subdued">plays / PDP views</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text variant="bodyLg" tone="subdued">Coverage</Text>
                  <Text variant="headingLg">68%</Text>
                  <Text variant="bodyMd" tone="subdued">products with video</Text>
                </BlockStack>
              </Card>
            </InlineGrid>
            <BlockStack gap="300">
              <Text variant="headingLg">Top products by plays (7d)</Text>
              <Box padding="0">
                <DataTable
                  columnContentTypes={[ "text", "text", "text", "text" , "text" , "text" ]}
                  headings={["Product","PDP views","Video plays","Play rate","", ""]}
                  rows={paginatedProducts.map((product) => [
                    product?.imageUrl ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Thumbnail
                        source={product?.imageUrl}
                        alt={product.title}
                        size="extraSmall"
                      />
                      {product?.title}
                      </span>
                    ) : (
                      "-"
                    ),
                    product?.pdpViews,
                    product?.playCount,
                    `${product?.playRate}%`,
                    <Button variant="plain" 
                      onClick={() => {
                        setModalProduct(product); 
                        shopify.modal.show('preview-modal')
                      }
                      }>Preview Video</Button>,
                    <Button 
                      icon={ViewIcon}  
                      onClick={(e) => { e.stopPropagation(); }}
                      variant="tertiary" url={product.onlineStorePreviewUrl} target="_blank"
                    />
                  ])}
                />
                {/* <Pagination
                  type="table"
                  hasPrevious={currentPage > 1}
                  onPrevious={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  hasNext={currentPage < totalPages}
                  onNext={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
                /> */}
              </Box>
            </BlockStack>
            <BlockStack gap="300">
              <Text variant="headingLg">Opportunities: products without video</Text>
              <Box padding="0" paddingBlockEnd="500">
                <DataTable
                  columnContentTypes={["text", "text", "text"]}
                  headings={["Product", "PDP views", "Preview"]}
                  rows={noVideoProducts.map((p) => [
                    p?.imageUrl ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Thumbnail source={p.imageUrl} alt={p.title} size="extraSmall" />
                        {p.title}
                      </span>
                    ) : (
                      p.title
                    ),
                    p?.pdpViews || 0,
                    <Button 
                      icon={ViewIcon} 
                      variant="tertiary" 
                      url={p.onlineStorePreviewUrl} 
                      target="_blank"
                    />,
                  ])}
                />
              </Box>
            </BlockStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
       <Modal id="preview-modal" open={!!modalProduct} onClose={() => setModalProduct(null)} >
        <iframe 
          width="100%" 
          height="400"
          src={modalProduct ? modalProduct?.videoUrl : ''} 
          title="YouTube video player" 
          frameBorder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
          allowFullScreen
        ></iframe>
        <TitleBar title="Video Preview">
          <button onClick={() => shopify.modal.hide('preview-modal')}>Close</button>
        </TitleBar>
      </Modal>
    </Page>
    ):
    (
    <>
      <Page title="Subscription Required">
        <Banner title="No active subscription found" status="critical"
            action={{
              content: "Buy Plan",
              onAction: handleBuyPlan
            }}
          >
          <p>You must complete your subscription to use this app.</p>
        </Banner>
      </Page>
    </>
    )
  );
}
