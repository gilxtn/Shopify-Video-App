import React, { useEffect, useState } from "react";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { Card, Page, Layout, Text, Box, InlineGrid, InlineStack, Button, Checkbox, BlockStack, Badge , Icon } from "@shopify/polaris";
import {PlayCircleIcon} from '@shopify/polaris-icons';
import { 
  Modal,
  TitleBar,
  useAppBridge,
} from "@shopify/app-bridge-react";
import { formatPrompt, youtubeSummaryPrompt } from "./utils/prompts";

async function getVideoSummary({ youtube_url, title, vendor, product_type }) {
  const prompt = formatPrompt(youtubeSummaryPrompt, {
    youtube_url,
    title,
    vendor,
    product_type,
  });

  const body = {
    model: "sonar-pro",
    messages: [{ role: "user", content: prompt }],
  };

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, // ← don’t hardcode
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


// Loader
export const loader = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session?.shop;
  const productIdParam = params.id;

  if (!productIdParam) {
    throw json({ error: "Missing product id" }, { status: 400 });
  }

  const numericProductId = (() => {
    try {
      return BigInt(productIdParam);
    } catch (e) {
      const parts = String(productIdParam).split("/");
      return BigInt(parts[parts.length - 1]);
    }
  })();

  const videos = await prisma.productExtendedInfo.findMany({
    where: { productId: numericProductId, shop },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      videoUrl: true,
      productTitle: true,
      aiSummary: true,
      highlights: true,
      isMain: true,
      createdAt: true,
    },
  });

   const response = await admin.graphql(
    `#graphql
    query ProductVideoMetafield($ownerId: ID!, $namespace: String!, $key: String!) {
      product(id: $ownerId) {
        title
        metafield(namespace: $namespace, key: $key) {
          id
          namespace
          key
          value
        }
      }
    }`,
    {
      variables: {
        ownerId: `gid://shopify/Product/${numericProductId}`,
        namespace: "custom",
        key: "youtube_videos_list",
      },
    }
  );

  const data = await response.json();
  const productData = data?.data?.product;

  let savedVideoUrls = [];
  const metafieldValue = productData?.metafield?.value;

  if (metafieldValue) {
    try {
      savedVideoUrls = JSON.parse(metafieldValue);
    } catch (e) {
      console.error("Failed to parse saved video URLs:", e);
    }
  }
  console.log("savedVideoUrls-----:", savedVideoUrls);
  return json({ videos, productIdParam, productData , savedVideoUrls  });
};

// Action
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop;

  const formData = await request.formData();
  const actionType = formData.get("actionType"); 
  const productId = formData.get("productId");
  
  if (!productId) {
    return json({ success: false, error: "Missing productId" }, { status: 400 });
  }

  const normalizeYoutubeUrl = (url) => {
    if (!url) return url;
    try {
      return url.replace("https://www.youtube.com/", "https://youtube.com/");
    } catch {
      return url;
    }
  };

  // video carouel videos
  if (actionType === "saveSelection") {
    const selectedVideos = JSON.parse(formData.get("selectedVideos") || "[]");
    const value = JSON.stringify(selectedVideos);
    console.log("Saving videos:", selectedVideos);
    const updateResponse = await admin.graphql(
      `#graphql
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              key
              namespace
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          metafields: [
            {
              namespace: "custom",
              key: "youtube_videos_list",
              type: "json",
              ownerId: productId.startsWith("gid://")
                ? productId
                : `gid://shopify/Product/${productId}`,
              value,
            },
          ],
        },
      },
    );
    const updateData = await updateResponse.json();
    console.log("updateData save selection--------shows", updateData?.data?.metafieldsSet?.metafields);
    if (updateData.errors || updateData.data?.metafieldsSet?.userErrors?.length) {
      return json(
        {
          success: false,
          errors: updateData.errors || updateData.data.metafieldsSet.userErrors,
        },
        { status: 500 },
      );
    }
    return json({ success: true, message: "Videos saved successfully." });
  }

  // SET MAIN VIDEO
  if (actionType === "setMainVideo") {
    const rawVideoUrl = formData.get("mainVideoUrl");
    const mainVideoUrl = normalizeYoutubeUrl(rawVideoUrl);
    const numericProductId = (() => {
      try {
        return BigInt(productId);
      } catch (e) {
        const parts = String(productId).split("/");
        return BigInt(parts[parts.length - 1]);
      }
    })();

    if (!mainVideoUrl) {
      return json({ success: false, error: "Missing mainVideoUrl" }, { status: 400 });
    }

   // 1. Fetch product info for prompt
   const productResp = await admin.graphql(`
     query getProduct($id: ID!) {
       product(id: $id) {
         title
         vendor
         productType
       }
     }
   `, { variables: { id: productId.startsWith("gid://") ? productId : `gid://shopify/Product/${productId}` } });

   const productJson = await productResp.json();
   const prod = productJson?.data?.product || {};
   console.log("prod", prod);

  // 2. Check DB for existing summary/highlights
  let existing = await prisma.productExtendedInfo.findFirst({
    where: { productId: numericProductId, shop, videoUrl: mainVideoUrl },
    select: { aiSummary: true, highlights: true },
  });

  let summary = existing?.aiSummary;
  let highlights = existing?.highlights;

   // 3. Call Perplexity API to get summary  highlights
  if (!summary || !highlights) {
    try {
      const result = await getVideoSummary({
        youtube_url: mainVideoUrl,
        title: prod.title || "",
        vendor: prod.vendor || "",
        product_type: prod.productType || "",
      });

      const content = result?.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      summary = parsed.summary || null;
      highlights = parsed.highlights || null;
      console.log("got video summary----", summary, highlights);
    } catch (err) {
      console.error("Failed to fetch video summary:", err);
    }
  }

    const updateMainResponse = await admin.graphql(
      `#graphql
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              key
              namespace
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          metafields: [
            {
              namespace: "custom",
              key: "youtube_demo_video",
              type: "single_line_text_field",
              ownerId: productId.startsWith("gid://") ? productId : `gid://shopify/Product/${productId}`,
              value: mainVideoUrl,
            },
            {
              namespace: "custom",
              key: "youtube_demo_summary",
              type: "multi_line_text_field",
              ownerId: productId.startsWith("gid://") ? productId : `gid://shopify/Product/${productId}`,
              value: summary || "",
            },
            {
              namespace: "custom",
              key: "youtube_demo_highlights",
              type: "json",
              ownerId: productId.startsWith("gid://") ? productId : `gid://shopify/Product/${productId}`,
              value: JSON.stringify(highlights || []),
            },
          ],
        },
      },
    );

    const updateMainData = await updateMainResponse.json();

    if (updateMainData.errors || updateMainData.data?.metafieldsSet?.userErrors?.length) {
      return json(
        { success: false, errors: updateMainData.errors || updateMainData.data.metafieldsSet.userErrors, },
        { status: 500 },
      );
    }

    // 5. Update DB main flag and summary
    await prisma.$transaction([
      prisma.productExtendedInfo.updateMany({
        where: { productId: numericProductId, shop },
        data: { isMain: false },
      }),
      prisma.productExtendedInfo.updateMany({
        where: { productId: numericProductId, shop, videoUrl: mainVideoUrl },
        data: {
          isMain: true,
          aiSummary: summary || "",
          highlights: highlights ? JSON.stringify(highlights) : null, 
        },
      }),
    ]);
    return json({ success: true, message: "Main video updated successfully." });
  }

  return json({ success: false, error: "Invalid actionType" }, { status: 400 });
};


// Component
export default function ProductVideoCarousel() {
  const { videos ,productIdParam, productData, savedVideoUrls } = useLoaderData();

  const fetcher = useFetcher();
  const shopify = useAppBridge();
  useEffect(() => {
    shopify.loading(false)
  },[]);

  const [currentAction, setCurrentAction] = useState(null);
  const isSubmitting = fetcher.state !== "idle";
  const initialSelected = videos.filter((v) => savedVideoUrls.includes(v.videoUrl)).map((v) => v.id);
  const [selectedVideos, setSelectedVideos] = useState(initialSelected);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null); 

  useEffect(() => {
  if (fetcher.data?.success) {
    if (currentAction === "setMainVideo") {
        setConfirmModalOpen(false);
        shopify.toast.show("Main video updated successfully!");
      }
      if (currentAction === "saveSelection") {
        shopify.toast.show("Selection saved successfully!");
      }
      setCurrentAction(null);
    }
    if (fetcher.data?.error) {
      shopify.toast.show(`Error: ${fetcher.data.error}`);
    }
  }, [fetcher.data]);


  const toggleSelect = (id) => {
    setSelectedVideos((prev) =>
      prev.includes(id)
        ? prev.filter((vid) => vid !== id)
        : [...prev, id]
    );
  };

  const handleSave = () => {
    setCurrentAction("saveSelection");
    console.log("Selected Videos:", selectedVideos);
    const urlsToSave = videos.filter((v) => selectedVideos.includes(v.id)).map((v) => v.videoUrl);
    fetcher.submit(
      {
        actionType: "saveSelection",
        productId: `gid://shopify/Product/${productIdParam}`,
        selectedVideos: JSON.stringify(urlsToSave),
      },
      { method: "POST" }
    );
  };

  const openPreview = (video) => {
    setActiveVideo(video);
    setPreviewModalOpen(true);
  };

  const openConfirm = (video) => {
    setActiveVideo(video);
    setConfirmModalOpen(true);
  };

  const confirmMainVideo = () => {
    if (!activeVideo) return;
    setCurrentAction("setMainVideo");
    fetcher.submit(
      {
        actionType: "setMainVideo",
        productId: `gid://shopify/Product/${productIdParam}`,
        mainVideoUrl: activeVideo.videoUrl,
      },
      { method: "POST" }
    );
  };

  return (
    <Page 
      backAction={{content: 'Home', url: '/app'}}
      title={`${productData.title}`} 
      subtitle="Select the videos to show in the Autovid video carousel block"
      fullWidth
      primaryAction={
        <Button 
          variant="primary" 
          onClick={handleSave}
          loading={isSubmitting && currentAction === "saveSelection"}>
            Save Selection
        </Button>
      }
    >
      <Layout>
        <Layout.Section>
          {/* <Text variant="headingMd" as="h4">{productData?.title}</Text> */}
          {videos.length === 0 ? (
            <Card>
              <Box padding="400">
                <Text as="p" tone="subdued">
                  No videos saved for this product yet.
                </Text>
              </Box>
            </Card>
          ) : (
            <> 
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
                {videos.map((v) => {
                  const isSelected = selectedVideos.includes(v.id);
                  const videoIdMatch = v.videoUrl.match(
                    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
                  );
                  const videoId = videoIdMatch ? videoIdMatch[1] : null;
                  const thumbnailUrl = videoId
                    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                    : null;


                  return (
                    <Card
                      roundedAbove="xs"
                      padding="0"
                      key={v.id}
                      subdued={!isSelected}
                    >
                  <div style={{padding:"12px" , cursor:"pointer"}} onClick={() => toggleSelect(v.id)}>
                    <InlineStack align="start" spacing="2">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt={`Preview of video ${v.id}`}
                          style={{
                            width: "100%",
                            height: "180px",
                            opacity: isSelected ? 1 : 0.4,
                            transition: "opacity 0.3s",
                            cursor: "pointer",
                            borderRadius: "4px",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <Box
                          style={{
                            width: "100%",
                            height: "170px",
                            backgroundColor: "#eee",
                            borderRadius: "8px",
                          }}
                        >
                          <Text tone="subdued">No preview available</Text>
                        </Box>
                      )}
                    </InlineStack>
                      <InlineStack align="center" gap="300">
                        <Checkbox
                          checked={isSelected}
                        />
                      </InlineStack>
                      </div>
                      <Box padding="300" paddingBlockStart="0">
                        <InlineStack gap="100" align="center" blockAlign="center">
                          <Button  size="slim"  onClick={() => {console.log(v,"video"); openPreview(v)}}>Preview</Button>
                          {v.isMain?<Badge tone="success" >Main Video</Badge>:<Button size="slim" onClick={() => {openConfirm(v)}}>Select as main video</Button>}
                        </InlineStack>
                      </Box>
                    </Card>
                  );
                })}
              </InlineGrid>
            </>
          )}
        </Layout.Section>
      </Layout>

{/* ==============================
    PREVIEW MODAL
============================== */}
{previewModalOpen && (
  <Modal  id="preview-modal" open={previewModalOpen} onHide={() => setPreviewModalOpen(false)} onShow={()=>{}}>
    <TitleBar title="Video Preview">
      <button onClick={() => setPreviewModalOpen(false)}>Close</button>
    </TitleBar>
    <Box padding="400">
      {activeVideo && (
        <>
          <iframe
            title="video-preview"
            width="100%"
            height="315"
            src={activeVideo.videoUrl}
            frameBorder="0"
            allowFullScreen
          ></iframe>
          <Box paddingBlockStart="200">
            <Text as="p" variant="bodyMd" tone="">
              URL: {activeVideo.videoUrl}
            </Text>
          </Box>
        </>
      )}
    </Box>
  </Modal>
)} 

{/* ==============================
    CONFIRMATION MODAL
============================== */}
{confirmModalOpen && (
  <Modal id="confirm-modal" open={confirmModalOpen} onHide={() => setConfirmModalOpen(false)} onShow={()=>{}}>
    <TitleBar title="Confirm Main Video">
      <button variant="primary" onClick={confirmMainVideo} disabled={isSubmitting && currentAction === "setMainVideo"}>{isSubmitting && currentAction === "setMainVideo" ? "Saving..." : "Confirm"}</button>
      <button onClick={() => setConfirmModalOpen(false)}>Cancel</button>
    </TitleBar>
    <Box padding="400">
      <Text>Are you sure you want to set this video as the main video?</Text>
      {activeVideo && (
        <Box paddingBlockStart="200">
          <Text tone="subdued">{activeVideo.videoUrl}</Text>
        </Box>
      )}
    </Box>
  </Modal>
)}


    </Page>
  );
}