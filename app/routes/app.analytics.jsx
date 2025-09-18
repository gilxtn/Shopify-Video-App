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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData } from "@remix-run/react";
import { TitleBar, useAppBridge, Modal } from "@shopify/app-bridge-react";
import { ChartLineIcon } from "@shopify/polaris-icons";
import prisma from "../db.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin ,session } = await authenticate.admin(request);
  const shopDomain = session.shop;
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

  const videoStats = await prisma.videoPlayCount.findMany({
    orderBy: {
      playCount: "desc",
    },
  });

  const products = [];
  for (const video of videoStats) {
    const gid = `gid://shopify/Product/${video.productId}`;
    const productQuery = `
      query {
        product(id: "${gid}") {
          id
          title
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
      products.push({
        id: video.productId.toString(),
        title: product.title,
        imageUrl: product.featuredMedia?.preview?.image?.url,
        videoUrl: video.videoUrl,
        playCount: video.playCount,
        summary: product?.metafield?.value,
      });
    }
  }

  return { count, products,hasActiveSubscription,shopDomain };
};

export default function Analytics() {
  const { count, products,hasActiveSubscription,shopDomain } = useLoaderData();

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 3;

  const topProduct = products[0]; // First item in sorted array
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
  return (
    hasActiveSubscription?(
<Page title="Analytics">
      <Layout>
        <Layout.Section>
          <InlineGrid
            columns={{ xs: "1fr", md: "1fr 1fr", lg: "1fr 300px" }}
            gap="400"
            alignItems="start"
          >
            <Card>
              <Box background="bg-fill" padding="400">
                <BlockStack gap="400">
                  <Text variant="headingLg">Top Performing Video</Text>
                  {topProduct ? (
                    <BlockStack gap="200">
                      <Text fontWeight="semibold" variant="bodyMd">
                        Product: {topProduct.title}
                      </Text>
                      {/* <Text variant="bodyMd">
                        Play Count: {topProduct.playCount}
                      </Text> */}

                      <InlineStack>
                        <Button
                          onClick={() => shopify.modal.show("video-modal")}
                        >
                          View
                        </Button>
                      </InlineStack>
                      <Modal id="video-modal">
                        <iframe
                          width="100%"
                          height="400"
                          src={`${topProduct.videoUrl}?controls=1&modestbranding=1&rel=0&disablekb=1`}
                        ></iframe>
                        <Box padding="400">
                          <Text variant="bodyMd" as="span">
                            {topProduct?.summary}
                          </Text>
                        </Box>
                        <br />
                        <br />

                        <TitleBar title={topProduct.title || "-"}></TitleBar>
                      </Modal>
                    </BlockStack>
                  ) : (
                    <Box paddingBlock="400">
                      <Text variant="bodyMd">No video found</Text>
                    </Box>
                  )}
                </BlockStack>
              </Box>
            </Card>

            <Card padding={300} shadow="300" background="bg-surface-info">
              <InlineGrid columns={"1fr auto"} alignItems="end">
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd">
                    Video Generation Count
                  </Text>
                  <Text as="h3" variant="heading2xl">
                    {count}
                  </Text>
                </BlockStack>
                <Icon source={ChartLineIcon} tone="base" />
              </InlineGrid>
            </Card>
          </InlineGrid>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Video Performance</Text>
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Thumbnail", "Product", "Play Count", "Video"]}
                rows={paginatedProducts.map((product) => [
                  product.imageUrl ? (
                    <Thumbnail
                      source={product.imageUrl}
                      alt={product.title}
                      size="small"
                    />
                  ) : (
                    "-"
                  ),
                  product.title,
                  product.playCount,
                  <a href={product.videoUrl} target="_blank" rel="noreferrer">
                    View Video
                  </a>,
                ])}
              />
              <Pagination
                type="table"
                hasPrevious={currentPage > 1}
                onPrevious={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                hasNext={currentPage < totalPages}
                onNext={() =>
                  setCurrentPage((p) => Math.min(p + 1, totalPages))
                }
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
    ):(
<>
 <Page title="Subscription Required">
    <Banner
      title="No active subscription found"
      status="critical"
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
