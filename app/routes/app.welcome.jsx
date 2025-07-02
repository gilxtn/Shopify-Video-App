import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  List,
  Divider,
  Button,
  Link,
  InlineGrid,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useEffect, useState } from "react";

export const loader = async ({ request }) => {
  console.log("welocme page render")
  const { admin,session, redirect} = await authenticate.admin(request);

  const checkMetafield = await admin.graphql(`query {
    currentAppInstallation {
      id
      metafields(first: 20) {
        edges {
          node {
            namespace
            key
            value
          }
        }
      }
    }
  }`);
    
  const result = await checkMetafield.json();
  
  const appId = result.data?.currentAppInstallation.id;
  const currentMetafields = result?.data?.currentAppInstallation?.metafields?.edges;

  const onboardingMetafield = currentMetafields?.find((field) => field.node.namespace === "Auto-Video" && field.node.key === "app_onboarding");
  const onboardingValue = onboardingMetafield?.node?.value === "true";
  return onboardingValue;
}

export const action = async ({ request }) => {
  try {
    console.log("Action starts");
    const { session, admin } = await authenticate.admin(request);
    const response = await admin.graphql(`query {
      currentAppInstallation {
        id
        metafields(first: 18) {
          edges {
            node {
              namespace
              key
              value
            }
          }
        }
      }
    }`);
    
  const result = await response.json();
  const appId = result.data.currentAppInstallation.id;
  console.log("appId", appId);
  const createMetafield = await admin.graphql(
    `#graphql
    mutation CreateAppDataMetafield($metafieldsSetInput: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafieldsSetInput) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafieldsSetInput: [
          {
            namespace: "Auto-Video",
            key: "app_onboarding",
            type: "boolean",
            value: "true",
            ownerId: appId,
          },
        ],
      },
    },
  );
  const res = await createMetafield.json();
  return json({
    success: true,
    message: "App Initialized Metafield Saved",
  });
  } catch (err) {
    console.error("Error in action:", err);
    return json({ success: false, message: err.message });
  }
};

export default function WelcomePage() {
  const shopify = useAppBridge();
  const [loadingBtn , setLoadingBtn] = useState(false);
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const onBoardingCompleted = useLoaderData();
  // const isLoading = ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";

  const getStarted = ()=>{
    setLoadingBtn(true);
    console.log("get started clicked")
    fetcher.submit({}, { method: "POST" })
  }

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.loading(true);
      navigate("/app");
    }
  }, [fetcher.data]);

  return (
  <Page fullWidth>
    <Layout>
      <Layout.Section>
        <BlockStack align="center" gap="200">
          <Text as="h2" variant="headingLg" alignment="center">
            Turn Product Pages into Demo Experiences
          </Text>
          <Text as="p" variant="bodyMd" alignment="center">
            This app automatically finds YouTube demo videos for your products and writes a short summary to help customers understand what they’re buying.
          </Text>
        </BlockStack>
      </Layout.Section>

      <Layout.Section>
        <Card padding="400">
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Feature Highlights
              </Text>
              <Text>
                Give your customers a better shopping experience with trusted YouTube demo videos. Designed for busy store managers, our app provides a hands-off, intelligent way to enhance your listings.
              </Text>
            </BlockStack>
            <InlineGrid columns={{ xs: 1, sm: 1, md: 3 }} gap="400">

              <BlockStack align="center" gap="200">
                <Box padding="200">
                  <svg style={{display:"block", margin:"5px auto 10px auto"}} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#5C6AC4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="10" cy="10" r="7"></circle>
                  <line x1="15" y1="15" x2="21" y2="21"></line>
                  <polygon points="9 8 11.5 10 9 12" fill="#fff"></polygon>
                </svg>

                <Text as="h4" variant="headingSm" alignment="center">Auto-Find YouTube Demos</Text>
                <Text alignment="center">
                  Automatically search YouTube for the best demo video for your products.
                </Text>
                </Box>
              </BlockStack>

              <BlockStack align="center" gap="200">
                <Box padding="200">
                <svg style={{display:"block", margin:"5px auto 10px auto"}} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#008060" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.17a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <Text as="h4" variant="headingSm" alignment="center">Easily Manage Content</Text>
                <Text alignment="center">
                  Add, remove, or update demo videos from one clean interface.
                </Text>
                  </Box>
              </BlockStack>

              <BlockStack align="center" gap="200">
                <Box padding="200">
                  <svg style={{display:"block", margin:"5px auto 10px auto"}} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E6683C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  <path d="M9 12l2 2 4-4"></path>
                </svg>
                <Text as="h4" variant="headingSm" alignment="center">Boost Buyer Confidence</Text>
                  <Text alignment="center">
                    Help customers hear, see, and understand the product before buying.
                  </Text>
                  </Box>
              </BlockStack>
            </InlineGrid>
          </BlockStack>
        </Card>
      </Layout.Section>

      {/* How It Works */}
      <Layout.Section>
        <Card padding="400">
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">How It Works</Text>
            <List type="number">
              <List.Item>
                <strong>One-time setup in a few clicks:</strong>
                <p> Add a video block to your universal product page.</p>
              </List.Item>
              <List.Item>
                <strong>Select the products:</strong>
                <p>Accept our video picks, request new ones, or add your own.</p>
              </List.Item>
              <List.Item>
                <strong>Track performance:</strong>
                <p>See which videos convert best with automatic summaries and analytics.</p>
              </List.Item>
            </List>
          </BlockStack>
        </Card>
      </Layout.Section>

      {/* CTA */}
      <Layout.Section>
        <InlineStack align="center">
          <Button size="large" variant="primary" 
          loading={loadingBtn}
          onClick={()=>{
            getStarted();
          }}>
            Let’s Get Started →
          </Button>
        </InlineStack>
      </Layout.Section>

      {/* <Layout.Section>
        <InlineStack align="center">
          <Text variant="bodySm" as="p"> Want to customize things first?{" "}
            <Link url="/settings">Go to Settings</Link> &nbsp;|&nbsp;
            <Link url="mailto:support@example.com">Contact Support</Link>
          </Text>
        </InlineStack>
      </Layout.Section> */}
    </Layout>
  </Page>
  );
}
