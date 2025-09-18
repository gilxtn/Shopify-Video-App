import { useCallback, useEffect, useState, useMemo } from "react";
import {
  useLoaderData,
  useFetcher,
  useNavigate,
} from "@remix-run/react";
import {
  Page,
  Layout,
  IndexTable,
  Text,
  Card,
  Thumbnail,
  InlineGrid,
  useIndexResourceState,
  IndexFilters,
  useSetIndexFiltersMode,
  Badge,
  Link,
  ChoiceList,
  TextField,
  Banner,
  Spinner,
  Icon,
  InlineStack,
  Autocomplete,
  Box,
  Divider,
  FormLayout,
  PageActions,
  Button,
  BlockStack,
  ButtonGroup,
} from "@shopify/polaris";
import { TitleBar, useAppBridge, Modal } from "@shopify/app-bridge-react";
import { DeleteIcon, ViewIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session, redirect } = await authenticate.admin(request);
  const shopDomain = session.shop;
   const queryParams = new URLSearchParams(request.url.split("?")[1]);

  const chargeId = queryParams.get("charge_id");
   const checkAppPlan = await admin.graphql(`
    query {
      currentAppInstallation {
        allSubscriptions(first: 10, reverse: true) {
          nodes {
            id
            status
            name
            test
          }
        }
      }
    }
  `);
  const data = await checkAppPlan.json();
  const subscriptions = data.data.currentAppInstallation.allSubscriptions;

  let findCharge = null;
  if (chargeId) {
      // If charge_id is present in URL
      findCharge = subscriptions.nodes.find(sub => sub.id.includes(chargeId));
  } else {
    if(subscriptions.nodes.length === 0){
        //If no plan exists 
        findCharge = true;
    }
    else{
      // If no charge_id is present, fallback to any ACTIVE plan
      findCharge = subscriptions.nodes.find(sub => sub.status === "ACTIVE");
    }
  }
 
  const response = await admin.graphql(`
    query {
      currentAppInstallation {
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
    }
  `);
  const result = await response.json();
  const currentMetafields =
    result?.data?.currentAppInstallation?.metafields?.edges || [];
  const onboardingMetafield = currentMetafields?.find(
    (field) =>
      field.node.namespace === "Auto-Video" &&
      field.node.key === "app_onboarding",
  );
  const onboardingComplete = onboardingMetafield?.node?.value === "true";

  const fetchTagsAndCategories = async () => {
    const gql = `
      {
        products(first: 250) {
          edges {
            node {
              tags
              category {
                id
                name
              }
            }
          }
        }
      }
    `;
    const response = await admin.graphql(gql);
    const json = await response.json();

    const edges = json?.data?.products?.edges || [];
    const allTags = edges.flatMap((edge) => edge.node.tags || []);
    const uniqueTags = Array.from(new Set(allTags));

    const allCategories = edges
      .map((edge) => edge.node.category)
      .filter(Boolean);

    const uniqueCategories = Array.from(
      new Map(allCategories.map((cat) => [cat.id, cat])).values(),
    );

    return { tags: uniqueTags, categories: uniqueCategories };
  };

  const { tags, categories } = await fetchTagsAndCategories();

  return new Response(
    JSON.stringify({ tags, categories, onboardingComplete , shopDomain, findCharge}),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
};

export default function ProductTable() {
  const fetcher = useFetcher();
  const { tags, categories, onboardingComplete , shopDomain, findCharge} = useLoaderData();
  const [products, setProducts] = useState([]);
  const [pageInfo, setPageInfo] = useState({ hasNextPage: false });
  const [lastCursor, setLastCursor] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [cursorStack, setCursorStack] = useState([]);
  const [currentCursor, setCurrentCursor] = useState(null);
  const [sortSelected, setSortSelected] = useState(["createdAt desc"]);
  const [demoVideo, setDemoVideo] = useState(null);
  const [category, setCategory] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [status, setStatus] = useState(null);
  const [tag, setTag] = useState(null);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [modalProduct, setModalProduct] = useState(null);
  const [modalDelete, setModalDelete] = useState(null);
  const [editIsLoading, setEditIsLoading] = useState(false);
  const [editVideo, seteditVideo] = useState(null);
  const { mode, setMode } = useSetIndexFiltersMode();
  const onHandleCancel = () => {};
  const isLoading = fetcher.state !== "idle";
  const [queryValue, setQueryValue] = useState("");
  const [editVideoLink, seteditVideoLink] = useState("");
  const [editVideoSummary, setEditVideoSummary] = useState("");
  const [editVideoHighlights, setEditVideoHighlights] = useState("");
  const [editError, setEditError] = useState("");
  const [manualError, setManualError] = useState({
    summary: "",
    highlights: "",
  });
  const [pageShow, setPageShow] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [radioValue, setRadioValue] = useState(["auto"]);
  const handleEditType = useCallback((value) => setRadioValue(value), []);
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const handleFiltersQueryChange = useCallback(
    (value) => setQueryValue(value),
    [],
  );

const navigateToSelect = (product_id)=>{
   console.log(`will navigate to` + product_id);
   shopify.loading(true);
   navigate(`/app/product-video-carousel/${product_id.split("/").pop()}`);
}

  const fetchProducts = (cursorValue = null, direction = "next") => {
    setIsProductLoading(true);
    const tabFilter =
      selectedTab === 0 ? null : itemStrings[selectedTab].toUpperCase();
    fetcher.submit(
      JSON.stringify({
        cursor: cursorValue,
        direction,
        query: queryValue,
        sortKey: sortSelected[0]?.split(" ")[0],
        reverse: sortSelected[0]?.includes("desc"),
        filters: {
          demoVideo,
          category,
          vendor,
          status: tabFilter || status,
          tag,
        },
      }),
      {
        method: "post",
        action: "/api/get-products",
        encType: "application/json",
      },
    );
    if (direction === "next" && cursorValue) {
      setCursorStack((prev) => [...prev, cursorValue]);
    }
    if (direction === "previous") {
      setCursorStack((prev) => prev.slice(0, -1));
    }
    setCurrentCursor(cursorValue);
  };

  useEffect(() => {
    if (onboardingComplete) {
      setPageShow(true);
    } else {
      navigate("/app/welcome");
    }
  }, [onboardingComplete]);

  useEffect(() => {
    if (queryValue) {
      const delayDebounce = setTimeout(() => {
        fetchProducts(null, "next");
      }, 400);
      return () => clearTimeout(delayDebounce);
    } else {
      fetchProducts(null, "next");
    }
  }, [
    demoVideo,
    category,
    vendor,
    status,
    tag,
    sortSelected,
    selectedTab,
    queryValue,
  ]);

  useEffect(() => {
    if (fetcher.data) {
      setIsProductLoading(false);
      const newProducts = fetcher.data.edges.map((edge) => ({
        ...edge.node,
        cursor: edge.cursor,
      }));
      console.log(newProducts, "newProducts");
      setProducts(newProducts);
      setLastCursor(fetcher.data.edges.at(-1)?.cursor || null);
      setPageInfo(fetcher.data.pageInfo);
    }
  }, [fetcher.data]);

  const [itemStrings, setItemStrings] = useState([
    "All",
    "Active",
    "Draft",
    "Archived",
  ]);

  const tabs = itemStrings.map((item, index) => ({
    content: item,
    index,
    onAction: () => setSelectedTab(index),
    id: `${item}-${index}`,
    isLocked: index === 0,
  }));

  const appliedFilters = [];

  if (demoVideo !== null) {
    appliedFilters.push({
      key: "demoVideo",
      label: `Has Youtube Video: ${demoVideo === "true" ? "Yes" : "No"}`,
      onRemove: () => setDemoVideo(null),
    });
  }
  if (category) {
    const selectedCategory = categories.find((cat) => cat.id === category);

    appliedFilters.push({
      key: "category",
      label: `Category: ${selectedCategory?.name || "Unknown"}`,
      onRemove: () => setCategory(null),
    });
  }
  if (vendor) {
    appliedFilters.push({
      key: "vendor",
      label: `Vendor: ${vendor}`,
      onRemove: () => setVendor(null),
    });
  }
  if (status) {
    appliedFilters.push({
      key: "status",
      label: `Status: ${status}`,
      onRemove: () => setStatus(null),
    });
  }
  if (tag) {
    appliedFilters.push({
      key: "tag",
      label: `Tag: ${tag}`,
      onRemove: () => setTag(null),
    });
  }

  const filters = [
    {
      key: "demoVideo",
      label: "Has Youtube Video",
      filter: (
        <ChoiceList
          title="Demo video"
          titleHidden
          choices={[
            { label: "Yes", value: "true" },
            { label: "No", value: "false" },
          ]}
          selected={demoVideo !== null ? [demoVideo.toString()] : []}
          onChange={(value) => setDemoVideo(value[0])}
        />
      ),
      shortcut: true,
    },
    {
      key: "category",
      label: "Category",
      filter: (
        <ChoiceList
          title="Category"
          choices={categories.map((cat) => ({
            label: cat?.name,
            value: cat?.id,
          }))}
          selected={[category]}
          onChange={(selected) => setCategory(selected[0])}
        />
      ),
    },
    {
      key: "vendor",
      label: "Vendor",
      filter: (
        <TextField
          label="Vendor"
          value={vendor || ""}
          onChange={(value) => setVendor(value)}
          autoComplete="off"
        />
      ),
    },
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={[
            { label: "Active", value: "ACTIVE" },
            { label: "Draft", value: "DRAFT" },
            { label: "Archived", value: "ARCHIVED" },
          ]}
          selected={status ? [status] : []}
          onChange={(value) => setStatus(value[0])}
        />
      ),
    },
    {
      key: "tag",
      label: "Tag",
      filter: (
        <Autocomplete
          options={tags?.map((t) => ({ label: t, value: t })) || []}
          selected={tag ? [tag] : []}
          onSelect={(selected) => {
            const selectedValue = selected[0];
            setTag(selectedValue);
          }}
          textField={
            <Autocomplete.TextField
              label="Tag"
              value={tag || ""}
              onChange={(value) => setTag(value)}
              autoComplete="off"
            />
          }
        />
      ),
    },
  ];

  const sortOptions = [
    { label: "Title", value: "title asc", directionLabel: "A-Z" },
    { label: "Title", value: "title desc", directionLabel: "Z-A" },
    { label: "Vendor", value: "vendor asc", directionLabel: "A-Z" },
    { label: "Vendor", value: "vendor desc", directionLabel: "Z-A" },
    { label: "Inventory", value: "inventory asc", directionLabel: "Low to High",},
    { label: "Inventory", value: "inventory desc", directionLabel: "High to Low",},
    { label: "Created", value: "createdAt asc", directionLabel: "Oldest first",},
    { label: "Created", value: "createdAt desc", directionLabel: "Newest first",},
  ];

  const { selectedResources, allResourcesSelected, handleSelectionChange } =  useIndexResourceState(products);
  // const [linke, setLinke] = useState("");
  // const [statuss, setStatuss] = useState("");
  // const [webhookError, setWebhookError] = useState("");

  const handleVideo = async (ids) => {
    try {
      console.log(ids, "ids--------");
      console.log(selectedResources, "selectedResources--------");
      const inputIds = Array.isArray(ids) ? ids : selectedResources;
      console.log(inputIds, "inputIds--------");
      setIsVideoLoading(true);
      const idsOnly = inputIds.map((id) => {
        const parts = id.split("/");
        return parts[parts.length - 1];
      });
      const response = await fetch(`/api/get-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(idsOnly),
      });
      console.log(response, "response-----");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Something went wrong");
      }
      const data = await response.json();
      console.log(data, "data-----data frontend");

// response example 
// const newRes = {
//     "success": true,
//     "message": "All products updated successfully",
//     "data": [
//         {
//             "data": {
//                 "productUpdate": {
//                     "product": {
//                         "id": "gid://shopify/Product/9817987940645",
//                         "title": "Enya Nova Go Acoustic",
//                         "tags": [
//                             "youtubevideo"
//                         ]
//                     },
//                     "userErrors": []
//                 },
//                 "metafieldsSet": {
//                     "metafields": [
//                         {
//                             "id": "gid://shopify/Metafield/64017908171045",
//                             "namespace": "custom",
//                             "key": "youtube_demo_video",
//                             "value": "https://youtube.com/embed/JRSF6FHmxhI"
//                         },
//                         {
//                             "id": "gid://shopify/Metafield/64017908203813",
//                             "namespace": "custom",
//                             "key": "youtube_demo_summary",
//                             "value": "The Enya Nova Go Acoustic Plus is a compact, travel-friendly carbon fiber guitar with built-in effects, making it perfect for musicians on the go or performers in intimate settings. Its sparkling colors and unique soundhole design stand out visually, while the onboard effects (acoustic, chorus, delay, fusion) add versatility to your playing experience. Durable, lightweight, and stylish, it's ideal for both practice and performance."
//                         },
//                         {
//                             "id": "gid://shopify/Metafield/73210663993637",
//                             "namespace": "custom",
//                             "key": "video_source",
//                             "value": "AUTO"
//                         },
//                         {
//                             "id": "gid://shopify/Metafield/64017908236581",
//                             "namespace": "custom",
//                             "key": "youtube_demo_highlights",
//                             "value": "[{\"label\":\"Specs overview\",\"timestamp\":\"1:07\"},{\"label\":\"Built-in effects demo\",\"timestamp\":\"2:33\"},{\"label\":\"Clean acoustic tone\",\"timestamp\":\"2:48\"},{\"label\":\"Reverb effect demo\",\"timestamp\":\"3:08\"},{\"label\":\"Delay effect demo\",\"timestamp\":\"3:28\"},{\"label\":\"Fusion effect demo\",\"timestamp\":\"3:48\"}]"
//                         }
//                     ],
//                     "userErrors": []
//                 }
//             },
//             "extensions": {
//                 "cost": {
//                     "requestedQueryCost": 20,
//                     "actualQueryCost": 20,
//                     "throttleStatus": {
//                         "maximumAvailable": 2000,
//                         "currentlyAvailable": 1980,
//                         "restoreRate": 100
//                     }
//                 }
//             }
//         },
//         {
//             "data": {
//                 "productUpdate": {
//                     "product": {
//                         "id": "gid://shopify/Product/9817988006181",
//                         "title": "Epiphone Thunderbird Bass",
//                         "tags": [
//                             "youtubevideo"
//                         ]
//                     },
//                     "userErrors": []
//                 },
//                 "metafieldsSet": {
//                     "metafields": [
//                         {
//                             "id": "gid://shopify/Metafield/63631010365733",
//                             "namespace": "custom",
//                             "key": "youtube_demo_video",
//                             "value": "https://youtube.com/embed/b4Oq653XoYM"
//                         },
//                         {
//                             "id": "gid://shopify/Metafield/63631010398501",
//                             "namespace": "custom",
//                             "key": "youtube_demo_summary",
//                             "value": "The Epiphone Thunderbird Vintage Pro IV delivers classic rock power and vintage style, with punchy humbuckers and a comfortable neck-through design. This demo showcases its iconic growl, versatile tones, and impressive build quality—perfect for players seeking a bold, reliable bass with historic flair."
//                         },
//                         {
//                             "id": "gid://shopify/Metafield/64913749082405",
//                             "namespace": "custom",
//                             "key": "video_source",
//                             "value": "AUTO"
//                         },
//                         {
//                             "id": "gid://shopify/Metafield/63631010431269",
//                             "namespace": "custom",
//                             "key": "youtube_demo_highlights",
//                             "value": "[{\"label\":\"Clean tone demo\",\"timestamp\":\"1:09\"},{\"label\":\"Pickup blend demonstration\",\"timestamp\":\"2:30\"}]"
//                         }
//                     ],
//                     "userErrors": []
//                 }
//             },
//             "extensions": {
//                 "cost": {
//                     "requestedQueryCost": 20,
//                     "actualQueryCost": 20,
//                     "throttleStatus": {
//                         "maximumAvailable": 2000,
//                         "currentlyAvailable": 1980,
//                         "restoreRate": 100
//                     }
//                 }
//             }
//         }
//     ],
//     "updateProducts": [
//         {
//             "shop": "workflow-dev1.myshopify.com",
//             "productId": "9817987940645",
//             "productTitle": "Enya Nova Go Acoustic",
//             "videoUrl": "https://youtube.com/embed/JRSF6FHmxhI",
//             "source_method": "AUTO",
//             "aiSummary": "The Enya Nova Go Acoustic Plus is a compact, travel-friendly carbon fiber guitar with built-in effects, making it perfect for musicians on the go or performers in intimate settings. Its sparkling colors and unique soundhole design stand out visually, while the onboard effects (acoustic, chorus, delay, fusion) add versatility to your playing experience. Durable, lightweight, and stylish, it's ideal for both practice and performance.",
//             "highlights": "[{\"label\":\"Specs overview\",\"timestamp\":\"1:07\"},{\"label\":\"Built-in effects demo\",\"timestamp\":\"2:33\"},{\"label\":\"Clean acoustic tone\",\"timestamp\":\"2:48\"},{\"label\":\"Reverb effect demo\",\"timestamp\":\"3:08\"},{\"label\":\"Delay effect demo\",\"timestamp\":\"3:28\"},{\"label\":\"Fusion effect demo\",\"timestamp\":\"3:48\"}]"
//         },
//         {
//             "shop": "workflow-dev1.myshopify.com",
//             "productId": "9817988006181",
//             "productTitle": "Epiphone Thunderbird Bass",
//             "videoUrl": "https://youtube.com/embed/b4Oq653XoYM",
//             "source_method": "AUTO",
//             "aiSummary": "The Epiphone Thunderbird Vintage Pro IV delivers classic rock power and vintage style, with punchy humbuckers and a comfortable neck-through design. This demo showcases its iconic growl, versatile tones, and impressive build quality—perfect for players seeking a bold, reliable bass with historic flair.",
//             "highlights": "[{\"label\":\"Clean tone demo\",\"timestamp\":\"1:09\"},{\"label\":\"Pickup blend demonstration\",\"timestamp\":\"2:30\"}]"
//         }
//     ]
// }


      if (response.status === 206) {
        console.log("partial success");
        const erroredProducts = data.erroredProducts
          .map((product) => product.title)
          .join(", ");
        console.log(data.erroredProducts, "erroredProducts", erroredProducts);
        shopify.toast.show(
          `Coundn't find a suitable video for ${erroredProducts}`,
          {
            isError: false,
          },
        );
      } else {
        const updatedCount = idsOnly.length;
        shopify.toast.show(
          `Video generated for ${updatedCount} product${updatedCount > 1 ? "s" : ""}`,
          {
            isError: false,
          },
        );
      }
    } catch (error) {
      console.error("Error fetching video:", error);
      shopify.toast.show(` Error: ${error.message}`, { isError: true });
    } finally {
      setIsVideoLoading(false);
      fetchProducts(currentCursor ?? null, "next");
    }
  };

  const promotedBulkActions = [
    {
      content: "Generate Youtube Video",
      onAction: handleVideo,
      disabled: isVideoLoading || selectedResources.length === 0,
      loading: isVideoLoading,
    },
  ];

  const handleDeleteVideo = async (product) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/delete-metafield`, {
        method: "POST",
        body: JSON.stringify({
          productId: product.id,
          tags: product.tags,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const result = await res.json();
      if (result.success) {
        shopify.modal.hide("delete-modal");
        shopify.modal.hide("demo-modal");
        setDeleteLoading(false);
        fetchProducts(currentCursor ?? null, "next");
        shopify.toast.show(`Video deleted for ${product.title}`);
      }
    } catch (error) {
      shopify.modal.hide("demo-modal");
      shopify.modal.hide("delete-modal");
      setDeleteLoading(false);
      console.error("Failed to delete metafield:", error);
    }
  };

  const handleEditVideo = async (product, videoLink, radioValue) => {
    if (!videoLink || videoLink.trim() === "") {
      setEditError("Video link cannot be empty.");
      return;
    }
    const trimmedLink = videoLink.trim();

    const youtubeRegex =
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = trimmedLink.match(youtubeRegex);

    if (!match || match[1].length !== 11) {
      setEditError("Please enter a valid YouTube video link.");
      return;
    }
    const videoId = match[1];
    try {
      setEditIsLoading(true);
      const res = await fetch(`/api/update-metafield`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          link: trimmedLink,
          videoId: videoId,
          title: product.title,
          vendor: product.vendor,
          product_type: product.productType,
          autoGenerateornot: radioValue[0],
          // summary: editVideoSummary,
          // highlights: editVideoHighlights,
        }),
      });
      //  if (radioValue[0] === "manual") {
      //     requestBody.summary = editVideoSummary;
      //     requestBody.highlights = editVideoHighlights;
      //   }

      if (!res.ok) {
        setEditError("The url is not valid");
      }
      const result = await res.json();
      if (result.success) {
        setEditError("");
        fetchProducts(currentCursor ?? null, "next");
        shopify.toast.show("Video link updated successfully", {
          isError: false,
        });
        shopify.modal.hide("edit-modal");
        shopify.modal.hide("demo-modal");
        setModalProduct(null);
      } else {
        setEditError("The url is not valid");
      }
    } catch (err) {
      console.error("Update failed:", err);
      setEditError("Failed to update video. Please try again.");
    } finally {
      setEditIsLoading(false);
    }
  };

  const validateYouTubeVideo = async (videoLink) => {
    const trimmedLink = videoLink.trim();
    const youtubeRegex =
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = trimmedLink.match(youtubeRegex);

    if (!trimmedLink || !match || match[1].length !== 11) {
      return { success: false, message: "Please enter a valid YouTube video link." };
    }

    const videoId = match[1];

    try {
      const validUrl = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );

      if (!validUrl.ok) {
        return { success: false, message: "This YouTube video does not exist or is private." };
      }

      return { success: true, videoId, trimmedLink };
    } catch (error) {
      console.error("YouTube validation error:", error);
      return { success: false, message: "Could not verify video. Please try again." };
    }
  };


  const [appliedVideoLink, setAppliedVideoLink] = useState(null);
  const [isApplied, setIsApplied] = useState(false);

const handleBuyPlan = () => {
   console.log(shopDomain, "shopDomain");
       if (shopDomain) {
      const shopName = shopDomain.replace(".myshopify.com", "");
          window.top.location.href = `https://admin.shopify.com/store/${shopName}/charges/autovid-test/pricing_plans`
    }
}
  return (
    <>
    {!findCharge && pageShow? (
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

    ):(
    pageShow && (
<Page title="Product Table with YouTube URLs" fullWidth>
          <Layout>
            <Layout.Section>
              <Card padding="0">
                <IndexFilters
                  filters={filters}
                  appliedFilters={appliedFilters}
                  onClearAll={() => {
                    setDemoVideo(null);
                    setCategory(null);
                    setVendor(null);
                    setStatus(null);
                    setTag(null);
                    setQueryValue("");
                  }}
                  sortOptions={sortOptions}
                  sortSelected={sortSelected}
                  queryValue={queryValue}
                  queryPlaceholder="Searching in all"
                  onQueryChange={handleFiltersQueryChange}
                  onQueryClear={() => setQueryValue("")}
                  onSort={setSortSelected}
                  cancelAction={{
                    onAction: onHandleCancel,
                    disabled: false,
                    loading: false,
                  }}
                  tabs={tabs}
                  selected={selectedTab}
                  onSelect={setSelectedTab}
                  canCreateNewView={false}
                  mode={mode}
                  setMode={setMode}
                  filteringAccessibilityTooltip="Search"
                />
                {isVideoLoading && (
                  <div style={{ textAlign: "center", padding: "10px 0" }}>
                    <Spinner
                      size="small"
                      accessibilityLabel="Loading AI video generation"
                    />
                    <Text variant="bodyMd" alignment="center">
                      Generating videos...
                    </Text>
                  </div>
                )}
                <IndexTable
                  loading={isProductLoading}
                  onSelectionChange={handleSelectionChange}
                  resourceName={{ singular: "product", plural: "products" }}
                  itemCount={products.length}
                  promotedBulkActions={promotedBulkActions}
                   lastColumnSticky={true}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  pagination={{
                    hasNext: pageInfo.hasNextPage,
                    hasPrevious: cursorStack.length > 0,
                    onNext: () =>
                      !isLoading && fetchProducts(lastCursor, "next"),
                    onPrevious: () => {
                      const previousCursor = cursorStack.at(-2) || null;
                      fetchProducts(previousCursor, "previous");
                    },
                    nextTooltip: "Next page",
                    previousTooltip: "Previous page",
                    type: "table",
                  }}
                  headings={[
                    { title: "" },
                    { title: "Product" },
                    { title: "Status" },
                    { title: "Demo video" },
                    { title: "Action" },
                    { title: "Inventory" },
                    { title: "Type" },
                    { title: "Video Source" },
                    // { title: "Video Status" },
                    // { title: "Category" },
                    { title: "Vendor" },
                    { title: "" }
                  ]}
                >
                  {products.map((product, index) => {
                    const variant = product.variants?.edges?.[0]?.node;
                    const quantity = variant?.inventoryQuantity ?? "-";
                    const tracked = variant?.inventoryItem?.tracked;
                    let inventoryStatus = "-";
                    if (tracked === false) {
                      inventoryStatus = "Not Tracked";
                    } else if (quantity === 0) {
                      inventoryStatus = "Out of Stock";
                    } else if (quantity > 0) {
                      inventoryStatus = `${quantity} In Stock`;
                    }
                    const videoSource =
                      product?.video_source?.value === "AUTO"
                        ? "Found automatically"
                        : product?.video_source?.value === "MANUAL"
                          ? "Added manually"
                          : "No video";
                    const status = product?.metafield?.value || "No video";
                    return (
                      <IndexTable.Row
                        id={product.id}
                        key={product.id}
                        selected={selectedResources.includes(product.id)}
                        position={index}
                      >
                        <IndexTable.Cell>
                          <Thumbnail size="small" source={
                              product.featuredImage?.url ||
                              "https://cdn.shopify.com/s/images/admin/default-product-image.png"
                            }
                            alt={product.featuredImage?.altText || product.title }
                          />
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Link monochrome removeUnderline
                            onClick={() => {
                              open(
                                `shopify://admin/products/${product.id.split("/").pop()}`,
                                "_blank",
                              );
                            }}
                          >
                            <Text variant="bodySm" fontWeight="regular" as="span">
                              {product?.title || "-"}
                            </Text>
                          </Link>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge size="small"
                            tone={
                              product.status === "ACTIVE"
                                ? "success"
                                : product.status === "DRAFT"
                                  ? "info"
                                  : ""
                            }
                          >
                            {product.status === "ACTIVE"
                              ? "Active"
                              : product.status === "DRAFT"
                                ? "Draft"
                                : product.status === "ARCHIVED" ||
                                    product.status === "ARCHIVE"
                                  ? "Archived"
                                  : product.status}
                          </Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {product?.metafield?.value ? (
                            <Button
                              onClick={() => {
                                setModalProduct(product);
                                seteditVideo(product);
                                seteditVideoLink(product?.metafield?.value);
                                setAppliedVideoLink(null); 
                                setIsApplied(false); 
                                setEditError(""); 
                                setEditVideoSummary(product?.summary?.value);
                                setEditVideoHighlights(
                                  product?.highlights?.value,
                                );
                                setModalDelete(product);
                                shopify.modal.show("demo-modal", {
                                  preventCloseOnOverlayClick: true,
                                });
                              }}
                            >
                              Preview/edit
                            </Button>
                          ) : (
                            <Button onClick={() => handleVideo([product.id])}>Get Video</Button>
                          )}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {product?.metafield?.value && (
                            <InlineStack gap="100" wrap={false}>
                              <button
                                onClick={() => {
                                  setModalDelete(product);
                                  shopify.modal.show("delete-modal");
                                }}
                                title="Delete Video"
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                <Icon source={DeleteIcon} />
                              </button>
                              <Button 
                                onClick={(e)=>{ 
                                  navigateToSelect(product.id);
                                }}>Select Videos</Button>
                           </InlineStack>
                          )}
                        </IndexTable.Cell>
                        <IndexTable.Cell>{inventoryStatus}</IndexTable.Cell>
                        <IndexTable.Cell>
                          {product?.productType}
                        </IndexTable.Cell>
                        <IndexTable.Cell>{videoSource}</IndexTable.Cell>
                        {/* <IndexTable.Cell>
                          <Badge size="small">{product?.tags}</Badge>
                        </IndexTable.Cell> */}
                        <IndexTable.Cell>{product?.vendor}</IndexTable.Cell>
                        <IndexTable.Cell >
                          <div className="preview-button-wrapper">
                          <style>
                            {`
                              .preview-button-wrapper .Polaris-Button {
                                opacity: 0;
                                transition: opacity 0.2s ease-in-out;
                              }
                              .Polaris-IndexTable__TableRow--hovered .preview-button-wrapper .Polaris-Button {
                                opacity: 1;
                              }
                            `}
                          </style>
                          <InlineStack gap="200">  
                            {product?.onlineStorePreviewUrl && (
                              <Button 
                                icon={ViewIcon}  
                                onClick={(e) => { e.stopPropagation(); }}
                                variant="tertiary" url={product.onlineStorePreviewUrl} target="_blank"
                              />
                            )}
                           </InlineStack>
                        </div>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>
              </Card>
              <Box paddingBlock={300}>
                <Divider />
              </Box>
            </Layout.Section>
          </Layout>
          <Modal id="demo-modal">
            <iframe  width="100%"  height="400" src={appliedVideoLink ?? modalProduct?.metafield?.value} />
            {/* <iframe
              width="100%"
              height="400"
              src={modalProduct?.metafield?.value}
            ></iframe> */}
            {/* <Box padding="400">
              <Text variant="bodyMd" as="span">
                {modalProduct?.summary?.value}
              </Text>
            </Box> */}
            <Page>
              <style>{`ul.Polaris-BlockStack.Polaris-BlockStack--listReset {gap: 0px;}`}</style>
              <FormLayout>
                <ChoiceList
                  title="Video link"
                  choices={[
                    { label: "Auto Generated", value: "auto" },
                    { label: "Edit Manually", value: "manual" },
                  ]}
                  selected={radioValue}
                  onChange={handleEditType}
                />

                {radioValue[0] === "manual" && (
                  <InlineStack gap="200" align="start" blockAlign="start">
                    <Box grow minWidth="80%">
                      <TextField
                        value={editVideoLink}
                        error={editError}
                        placeholder="Youtube video link"
                        onChange={(value) => {
                          seteditVideoLink(value); // update field
                          setEditError(""); // clear error on typing
                        }}
                        autoComplete="off"
                        helpText={editError ? "" : "Format Example: https://youtube.com/embed/videoId"}
                      />
                    </Box>

                    {/* <Button
                      onClick={() =>
                        handleEditVideo(editVideo, editVideoLink, radioValue)
                      }
                      loading={editIsLoading}
                    >
                      Apply
                    </Button> */}
                    <Button onClick={async () => {
                        const result = await validateYouTubeVideo(editVideoLink);
                        if (!result.success) {
                          setEditError(result.message);
                          return;
                        }
                        setAppliedVideoLink(result.trimmedLink); 
                        setIsApplied(true); 
                        setEditError("");   
                      }}>Apply</Button>

                  </InlineStack>
                )}
                {/* {editError && <Text tone="critical">{editError}</Text>} */}
              </FormLayout>
              <br></br>
              <InlineStack wrap={false} align="end">
                <ButtonGroup>
                  {/* <Button
                    onClick={() => handleDeleteVideo(modalDelete)}
                    variant="primary"
                    tone="critical"
                    loading={deleteLoading}
                  >
                    Delete
                  </Button> */}
                  <Button
                    variant="primary"
                    loading={editIsLoading}
                    disabled={!isApplied ||  appliedVideoLink === modalProduct?.metafield?.value}
                    onClick={() => {
                      console.log(editVideo, editVideoLink, radioValue);
                      handleEditVideo(editVideo, editVideoLink, radioValue);
                    }}
                  >
                    Update
                  </Button>
                  <Button 
                   onClick={() => {
                    shopify.modal.hide("demo-modal");
                    setAppliedVideoLink(null); 
                    setIsApplied(false);
                    setEditError(""); 
                  }}>
                    Close
                  </Button>
                </ButtonGroup>
              </InlineStack>
              {/* <PageActions
                primaryAction={{
                    content: "Update",
                    onAction: () => handleEditVideo(editVideo, editVideoLink),
                    loading: editIsLoading,
                }}
            /> */}
            </Page>
            <TitleBar title={modalProduct?.title || "-"}></TitleBar>
          </Modal>
          <Modal id="video-modal">
            <iframe
              width="100%"
              height="400"
              src={modalProduct?.metafield?.value}
            ></iframe>
            <Box padding="400">
              <Text variant="bodyMd" as="span">
                {modalProduct?.summary?.value}
              </Text>
            </Box>
            <TitleBar title={modalProduct?.title || "-"}></TitleBar>
          </Modal>

          <Modal id="edit-modal">
            <TitleBar title="Edit YouTube Video"></TitleBar>
            <Page>
              <style>{`ul.Polaris-BlockStack.Polaris-BlockStack--listReset {gap: 0px;}`}</style>
              <FormLayout>
                <TextField
                  value={editVideoLink}
                  error={editError}
                  onChange={(value) => {
                    seteditVideoLink(value); 
                    setEditError("");
                    setIsApplied(false);  
                  }}
                  autoComplete="off"
                />
                <ChoiceList
                  title="Video summary and highlights"
                  choices={[
                    { label: "Auto Generated", value: "auto" },
                    { label: "Edit Manually", value: "manual" },
                  ]}
                  selected={radioValue}
                  onChange={handleEditType}
                />
                {radioValue[0] === "manual" && (
                  <BlockStack gap="300">
                    <TextField
                      value={editVideoSummary}
                      onChange={(value) => {
                        setEditVideoSummary(value);
                      }}
                      label="Video summary"
                      autoComplete="off"
                      multiline
                    />
                    <TextField
                      value={editVideoHighlights}
                      onChange={(value) => {
                        setEditVideoHighlights(value);
                      }}
                      label="Video hightlights"
                      autoComplete="off"
                      multiline
                    />
                  </BlockStack>
                )}
              </FormLayout>
              <br></br>
              <InlineStack wrap={false} align="end">
                <ButtonGroup>
                  <Button
                    variant="primary"
                    loading={editIsLoading}
                    onClick={() =>
                      handleEditVideo(editVideo, editVideoLink, radioValue)
                    }
                  >
                    Update
                  </Button>
                  <Button onClick={() => shopify.modal.hide("edit-modal")}>
                    Close
                  </Button>
                </ButtonGroup>
              </InlineStack>
              {/* <PageActions
                primaryAction={{
                    content: "Update",
                    onAction: () => handleEditVideo(editVideo, editVideoLink),
                    loading: editIsLoading,
                }}
            /> */}
            </Page>
          </Modal>
          <Modal id="delete-modal">
            <TitleBar title="Delete YouTubeLink"></TitleBar>
            <Page>
              <BlockStack gap="200">
                <Text variant="bodyLg" as="p">
                  Are you sure you want to delete the video for "
                  {modalDelete?.title}"?{" "}
                </Text>
              </BlockStack>
              <br></br>
              <InlineStack wrap={false} align="end">
                <ButtonGroup>
                  <Button
                  tone="critical"
                    variant="primary"
                    loading={deleteLoading}
                    onClick={() => handleDeleteVideo(modalDelete)}
                  >
                    Delete
                  </Button>
                  <Button onClick={() => shopify.modal.hide("delete-modal")}>
                    Close
                  </Button>
                </ButtonGroup>
              </InlineStack>
            </Page>
          </Modal>
        </Page>
    )
    )}
   
    </>
  );
}
