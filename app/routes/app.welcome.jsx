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
  Tabs,
  Link,
  InlineGrid,
  Box,
  Icon,
} from "@shopify/polaris";
import {CheckCircleIcon} from '@shopify/polaris-icons';
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { useEffect, useState } from "react";
import { useCallback } from "react";

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
      activeSubscriptions {
          id
          name
          status
      }
    }
  }`);
    
  const result = await checkMetafield.json();
  
  const appId = result.data?.currentAppInstallation.id;
  const currentMetafields = result?.data?.currentAppInstallation?.metafields?.edges;

  const onboardingMetafield = currentMetafields?.find((field) => field.node.namespace === "Auto-Video" && field.node.key === "app_onboarding");
  const onboardingValue = onboardingMetafield?.node?.value === "true";
  const activeSubs =
    result?.data?.currentAppInstallation?.activeSubscriptions || [];
  const hasActiveSubscription = activeSubs.some(
    (sub) => sub.status === "ACTIVE"
  );

  return {
    onboardingValue,
    hasActiveSubscription,
    shopDomain: session.shop,
  };
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
  const { onboardingValue, hasActiveSubscription, shopDomain } = useLoaderData();
  console.log("onboardingValue", onboardingValue);
  // const isLoading = ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";
  const [selected, setSelected] = useState(0);

  const handleTabChange = useCallback(
    (selectedTabIndex) => setSelected(selectedTabIndex),
    [],
  );

  const tabs = [
    {
      id: 'getting-started',
      content: 'Getting started',
      accessibilityLabel: 'Getting started',
      panelID: 'getting-started-content-1',
    },
    {
      id: 'faqs',
      content: 'FAQs',
      panelID: 'faqs-content-1',
    },
  ];
  const getStarted = ()=>{
    setLoadingBtn(true);
    console.log("get started clicked")
   
    fetcher.submit({}, { method: "POST" });
  }

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.loading(true);
       if (!hasActiveSubscription && shopDomain) {
          const shopName = shopDomain.replace(".myshopify.com", "");
          window.top.location.href = `https://admin.shopify.com/store/${shopName}/charges/autovid/pricing_plans`;
          return;
        }else{
          navigate("/app");
        }     
    }
  }, [fetcher.data]);

  return (
  <Page fullWidth>
    <Layout>
      <Layout.Section>
        {/* <BlockStack align="center" gap="200">
          <Text as="h2" variant="headingLg" alignment="center">
            Turn Product Pages into Demo Experiences
          </Text>
          <Text as="p" variant="bodyMd" alignment="center">
            This app automatically finds YouTube demo videos for your products and writes a short summary to help customers understand what they’re buying.
          </Text>
        </BlockStack> */}
        <div style={{position:"relative"}}>
          <div style={{position:"absolute", right:"0px", top:"0px"}}>
            <Button size="large" variant="primary"  loading={loadingBtn} onClick={()=>{ getStarted(); }}>
            {onboardingValue? "Go to Dashboard →":"Let’s Get Started →"}
            </Button>
          </div>
        <Tabs tabs={tabs} selected={selected} onSelect={handleTabChange}>
          
          {selected === 0 && (
          <BlockStack gap="300">
          <Card padding="400">
            <BlockStack gap="300">
             <Text variant="headingMd" as="h4">How AutoVid works and who is it for?</Text>
             <List type="bullet">
                <List.Item>AutoVid works best for multi-brand stores with well-known products - Products with strong online presence generate the highest-quality video results.</List.Item>
                <List.Item>AutoVid finds pre-made videos created by brands and influencers - not every product has a video about it available online.</List.Item>
                <List.Item>You can always remove, replace, or manually add your own video - AutoVid gives full control to override any result.</List.Item>
                <List.Item>Adding videos won’t slow down your store - Videos load only when customers interact, using Shopify’s lightweight theme block.</List.Item>
              </List>
            </BlockStack>
          </Card>
           <Card padding="400">
            <InlineGrid columns={{ lg: "2", sm: "1" }}>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h4">Onboarding checklist</Text>
                <InlineGrid gap="0" columns={"auto 1fr"} alignItems="start" >
                  <BlockStack><Icon source={CheckCircleIcon} tone="base"/></BlockStack>
                  <BlockStack gap="100">
                    <Box paddingInlineStart="300"><Text variant="headingMd" as="h4">Embed AutoVid video block</Text></Box>
                    <List type="number">
                      <List.Item>{"On the left side menu, navigate to your Online store > "}<Link url="shopify://admin/themes">Themes</Link></List.Item>
                      <List.Item>Click Customize, and open the top store page selection dropdown</List.Item>
                      <List.Item>Select “Products” pages and click to edit your default product page</List.Item>
                      <List.Item>Click to “Add section”, select “Apps”, and select “AutoVid Video Block” </List.Item>
                    </List>
                  </BlockStack>
                </InlineGrid>
                <InlineGrid gap="0" columns={"auto 1fr"} alignItems="start" >
                  <BlockStack><Icon source={CheckCircleIcon} tone="base"/></BlockStack>
                  <BlockStack gap="100">
                    <Box paddingInlineStart="200"><Text variant="headingMd" as="h4">Where to add the video block? </Text></Box>
                    <Box paddingInlineStart="200">
                      <List type="bullet">
                        <List.Item>The goal of the video block is to boost trust and support Add to cart</List.Item>
                        <List.Item>Best practices - on top of the details section or under the Add to cart button</List.Item>
                        <List.Item>Plan for mobile view first, and feel free to try different placements</List.Item>
                      </List>
                    </Box>
                  </BlockStack>
                </InlineGrid>
                <InlineGrid gap="0" columns={"auto 1fr"} alignItems="start" >
                  <BlockStack><Icon source={CheckCircleIcon} tone="base"/></BlockStack>
                  <BlockStack gap="100">
                    <Box paddingInlineStart="300"><Text variant="headingMd" as="h4">Embed AutoVid video block</Text></Box>
                    <List type="number">
                      <List.Item>Go to AutoVid main <Link url="/app">dashboard</Link> and click “Get Video” or bulk “Get Videos”</List.Item>
                      <List.Item>To optimize your prompt reach out to <a href="mailto:hello@autovidapp.com">hello@autovidapp.com</a></List.Item>
                    </List>
                  </BlockStack>
                </InlineGrid>
              </BlockStack>
              <BlockStack gap="300" align="center">
                <iframe style={{borderRadius: "10px"}} width="100%" height="340" src="https://www.youtube.com/embed/Uc9hOmFKJNU?si=B0LvovQWOf9_1tah" 
                title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
              </BlockStack>
            </InlineGrid>
           </Card>
          </BlockStack>
          )}
          {selected === 1 && (
            <InlineGrid gap="400" columns={{ lg: "2", sm: "1" }}>
              <Card padding="400" key="col-1">
               <BlockStack gap="300">
                <Text variant="headingLg" as="h3">Product Fit & Video Availability</Text>
                <BlockStack>
                  <Text variant="headingMd" as="h4">Does AutoVid work better for multi-brand stores or single-brand stores?</Text>
                  <Text as="p">AutoVid works best for multi-brand stores offering well-known brands, since these products usually have many high-quality videos online. Single-brand or private-label stores may get fewer results depending on available content.</Text>
                </BlockStack>
                <BlockStack>
                  <Text variant="headingMd" as="h4">What types of products get the best video results?</Text>
                  <Text as="p">Products with strong online presence perform best: electronics, musical instruments, apparel, footwear, sports gear, beauty, and home goods. Niche or custom items may have fewer videos.</Text>
                </BlockStack>
              </BlockStack>
              </Card>
              <Card padding="400" key="col-2"> 
               <BlockStack gap="300">
                <Text variant="headingLg" as="h3">Performance & Placement</Text>
                <BlockStack>
                  <Text variant="headingMd" as="h4">Will AutoVid slow down my Shopify store?</Text>
                  <Text as="p">No. AutoVid uses a lightweight Shopify theme block and the optimized YouTube embed. Videos load only when customers interact, so page speed is not affected.</Text>
                </BlockStack>
                <BlockStack>
                  <Text variant="headingMd" as="h4">Where on the product page does the video appear?</Text>
                  <Text as="p">AutoVid adds a theme app block you can place anywhere your theme supports—below product images, after the description, or in the media gallery. The position is fully customizable.</Text>
                </BlockStack>
              </BlockStack>
              </Card>
              
              <Card padding="400" key="col-3"> 
               <BlockStack gap="300">
                <Text variant="headingLg" as="h3">How AutoVid Works</Text>
                <BlockStack>
                  <Text variant="headingMd" as="h4">How does AutoVid choose which video is best?</Text>
                  <Text as="p">AutoVid uses AI to search for official promos, demos, and high-quality reviews. It filters out irrelevant or low-quality videos and selects the most accurate match for the product.</Text>
                </BlockStack>
                <BlockStack>
                  <Text variant="headingMd" as="h4">Does AutoVid detect and avoid negative product reviews?</Text>
                  <Text as="p">Yes. AutoVid avoids videos with negative sentiment, complaints, or price rants. If only negative content exists, it won’t assign a video.</Text>
                </BlockStack>
              </BlockStack>
              </Card>
              <Card padding="400" key="col-4"> 
               <BlockStack gap="300">
                <Text variant="headingLg" as="h3">Legal & Security</Text>
                <BlockStack>
                  <Text variant="headingMd" as="h4">Is it legal to embed YouTube videos on my product pages?</Text>
                  <Text as="p">Yes. Embedding is permitted by YouTube’s Terms of Service as long as the official YouTube embed player is used—which AutoVid uses.</Text>
                </BlockStack>
                <BlockStack>
                  <Text variant="headingMd" as="h4">Is my product data stored securely?</Text>
                  <Text as="p">Yes. AutoVid stores only minimal product information and follows Shopify security and GDPR requirements. All data is encrypted.</Text>
                </BlockStack>
              </BlockStack>
              </Card>
              <Card padding="400" key="col-5"> 
               <BlockStack gap="300">
                <Text variant="headingLg" as="h3">Managing Videos</Text>
                <BlockStack>
                  <Text variant="headingMd" as="h4">How do I remove or replace a video?</Text>
                  <Text as="p">You can remove or replace any video in your AutoVid dashboard. You can delete it, run a new search, or manually paste your own YouTube link.</Text>
                </BlockStack>
              </BlockStack>
              </Card> 
              <Card padding="400" key="col-6"> 
               <BlockStack gap="300">
                <Text variant="headingLg" as="h3">Roadmap & Future Features</Text>
                <BlockStack>
                  <Text variant="headingMd" as="h4">Will AutoVid support more platforms like Instagram or TikTok?</Text>
                  <Text as="p">Yes. Support for Instagram and TikTok video sourcing is planned for upcoming releases.</Text>
                </BlockStack>
              </BlockStack>
              </Card>
            </InlineGrid>
          
          )}
          
        </Tabs>
        </div>
      </Layout.Section>

    </Layout>
  </Page>
  );
}
