import { useCallback, useEffect, useState, useMemo } from "react";
import {useLoaderData, useFetcher,useNavigate,} from "@remix-run/react";
import { Page, Layout, IndexTable, Text, Card, Thumbnail, InlineGrid, useIndexResourceState, IndexFilters, useSetIndexFiltersMode, Badge, Link, ChoiceList, TextField, Banner, Spinner, Icon, InlineStack, Autocomplete, Box, Divider, FormLayout, PageActions, Button, BlockStack, ButtonGroup, ActionMenu,} from "@shopify/polaris";
import { TitleBar, useAppBridge, Modal } from "@shopify/app-bridge-react";
import { CircleChevronLeftIcon, DeleteIcon, TextBlockIcon, ViewIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { formatPrompt } from "./utils/prompts";

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
        metafields(first: 30) {
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
  const [pageShow, setPageShow] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [radioValue, setRadioValue] = useState(["auto"]);
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
  }, [ demoVideo, category, vendor, status, tag, sortSelected, selectedTab, queryValue,]);

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

  const [itemStrings, setItemStrings] = useState([ "All", "Active", "Draft", "Archived",]);

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

const handleVideo = async (ids) => {
  try {
    const inputIds = Array.isArray(ids) ? ids : selectedResources;
    const idsOnly = inputIds.map((id) => id.split("/").pop());
    setIsVideoLoading(true);
    const updatedProducts = [];
    const erroredProducts = [];

    // Loop over each product individually
    for (const id of idsOnly) {
      try {
        const response = await fetch(`/api/get-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([id]), 
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Something went wrong");
        }

        const data = await response.json();
        console.log(data, "data for product--------------" + id);
        const updated = Array.isArray(data.updateProducts) ? data.updateProducts[0]: data.updateProducts;

        if (updated) {
          updatedProducts.push(data);
          setProducts((prev) => [...prev, data]);
          fetchProducts(currentCursor ?? null, "next");
          shopify.toast.show(`Video generated for ${updated.productTitle || "product"}`, { isError: false });
        }
      } catch (error) {
        console.error("Error fetching video for product", id, error);
        erroredProducts.push(id);
      }
    }

    // Final summary for errored products
    if (erroredProducts.length) {
      shopify.toast.show(
        `Couldn't find videos for ${erroredProducts.join(", ")}`,
        { isError: true }
      );
    }

    if (updatedProducts.length) {
      shopify.toast.show(
        `Video generated for ${updatedProducts.length} product${
          updatedProducts.length > 1 ? "s" : ""
        }`,
        { isError: false }
      );
    }
  } catch (error) {
    console.error("Error fetching video:", error);
    shopify.toast.show(`Error: ${error.message}`, { isError: true });
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
  const youtubeRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/;
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
    // Always return standardized embed format
    const formattedLink = `https://youtube.com/embed/${videoId}`;
    return { success: true, videoId, trimmedLink: formattedLink };
  } catch (error) {
    console.error("YouTube validation error:", error);
    return { success: false, message: "Could not verify video. Please try again." };
  }
};

const [appliedVideoLink, setAppliedVideoLink] = useState(null);
const [isApplied, setIsApplied] = useState(false);
const mainVideo = appliedVideoLink  ?? modalProduct?.extendedInfo?.find((v) => v.isMain)?.videoUrl;
const otherVideos = modalProduct?.extendedInfo?.map((v) => v.videoUrl) || [];
const allVideos = otherVideos;
const [selectedVideo, setSelectedVideo] = useState(mainVideo);

const activeVideoSummary = useMemo(() => {
  return modalProduct?.extendedInfo?.find(
    (info) => info.videoUrl === selectedVideo
  )?.aiSummary || "";
}, [modalProduct, selectedVideo]);

const [currentIndex, setCurrentIndex] = useState(0);
const [videoMeta, setVideoMeta] = useState(null);
const handlePrev = () => { if (currentIndex > 0) setCurrentIndex(currentIndex - 1);};
const handleNext = () => { if (currentIndex < allVideos.length - 3) setCurrentIndex(currentIndex + 1);};
useEffect(() => {
  if (mainVideo) {setSelectedVideo(mainVideo);}
}, [mainVideo]);

useEffect(() => {
  if (radioValue[0] === "auto") {
    // Reset to original auto main video when switching back
    const autoMain = modalProduct?.extendedInfo?.find((v) => v.isMain)?.videoUrl;
    if (autoMain) {
      setSelectedVideo(autoMain);
      setAppliedVideoLink(null); // clear manual override
      setIsApplied(false);
    }
  }
}, [radioValue, modalProduct]);

useEffect(() => {
  if (selectedVideo) {
    // const match = selectedVideo.match(/(?:v=|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    // const videoId = match ? match[1] : null;
  const trimmedLink = selectedVideo.trim();
  const youtubeRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/;
  const match = trimmedLink.match(youtubeRegex);

  if (!trimmedLink || !match || match[1].length !== 11) {
    setVideoMeta(null);
  }
  const videoId = match[1];

  if (videoId) {
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then((res) => res.json())
      .then((data) => {
        setVideoMeta({
          title: data.title,
          channel: data.author_name,
        });
      })
      .catch((err) => {
        console.error("Failed to fetch video metadata:", err);
        setVideoMeta(null);
      });
  }
}
}, [selectedVideo]);

const handleBuyPlan = () => {
    if (shopDomain) {
      const shopName = shopDomain.replace(".myshopify.com", "");
      window.top.location.href = `https://admin.shopify.com/store/${shopName}/charges/autovid-test/pricing_plans`
    }
}

return (
    <>
    {!findCharge && pageShow? (
    <Page title="Subscription Required">
        <Banner title="No active subscription found" status="critical" action={{
          content: "Buy Plan",
          onAction: handleBuyPlan
        }}> 
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
                  <Spinner size="small" accessibilityLabel="Loading AI video generation" />
                  <Text variant="bodyMd" alignment="center"> Generating videos...</Text>
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
                  { title: "Vendor" },
                  { title: "" }
                ]}
              >
                {products.map((product, index) => {
                  const totalInventory = product?.totalInventory ?? null;
                  const tracked = product?.tracksInventory;
                  const variantCount = product?.variantsCount?.count ?? 0;
                  let inventoryStatus = "-";

                  if (tracked === false) {
                    inventoryStatus = "Inventory not Tracked";
                  } else if (totalInventory === 0) {
                    inventoryStatus = variantCount > 1
                      ? `0 in stock for ${variantCount} variants`
                      : "Out of stock";
                  } else if (totalInventory > 0) {
                    inventoryStatus = variantCount > 1
                      ? `${totalInventory} in stock for ${variantCount} variants`
                      : `${totalInventory} in stock`;
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
                      {/* <IndexTable.Cell>{inventoryStatus}</IndexTable.Cell> */}
                      <IndexTable.Cell>
                        {inventoryStatus?.toLowerCase().startsWith("0 in stock") ||
                        inventoryStatus?.toLowerCase().startsWith("out of stock") ? (
                          <Text variant="bodySm" as="span">
                            <span style={{ color: "#881919", fontWeight: 500 }}>
                              {inventoryStatus.split(" ")[0]} {inventoryStatus.split(" ")[1]} {inventoryStatus.split(" ")[2]}
                            </span>{" "}
                            {inventoryStatus.split(" ").slice(3).join(" ")}
                          </Text>
                        ) : (
                          <Text variant="bodySm" as="span">{inventoryStatus}</Text>
                        )}
                      </IndexTable.Cell>
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
                            .automatic-block{ position: relative }
                            .automatic-block:after{  content: "";  width:100%;  left:0;  top:0;  height:100%;  
                              position: absolute;  z-index: 1;  right: 0;  bottom: 0;  pointer-events: none;  background: rgba(11, 8, 8, 0.5);
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
          <Box padding="300" paddingBlockStart="200">
            <FormLayout>
                <ActionMenu
                  actions={[
                    radioValue[0] === "auto"
                      ? { content: "Switch to manual editor", onAction: () => setRadioValue(["manual"]), }
                      : { content: "Switch to automated mode", onAction: () => setRadioValue(["auto"]),},
                  ]}
                >
                  {/* <Button disclosure="down">More actions...</Button> */}
                </ActionMenu>
            {radioValue[0] === "manual" && (
            <InlineStack gap="200" align="start" blockAlign="start">
                  <Box  minWidth="80%">
                    <TextField
                      value={editVideoLink}
                      error={editError}
                      placeholder="Youtube video link"
                      onChange={(value) => {
                        seteditVideoLink(value); // update field
                        setEditError(""); 
                        setSelectedVideo(result.trimmedLink);
                        document.querySelector('.automatic-block')?.classList.remove('automatic-block');
                        // clear error on typing
                      }}
                      autoComplete="off"
                      helpText={editError ? "" : "Format Example: https://youtube.com/embed/videoId"}
                    />
                  </Box>
                  <Button
                    variant="primary"
                    tone="success"
                    onClick={async () => {
                      const result = await validateYouTubeVideo(editVideoLink);
                      if (!result.success) {
                        setEditError(result.message);
                        return;
                      }
                      setAppliedVideoLink(result.trimmedLink);
                      seteditVideoLink(result.trimmedLink);
                      setIsApplied(true);
                      setEditError("");
                      console.log(result.trimmedLink,"applied link---");
                      
                    }}
                  >
                    Apply
                  </Button>
                </InlineStack>
              )}
            </FormLayout>
          </Box>
        
          {/* <div class={(radioValue[0] === "manual" && (!isApplied || appliedVideoLink === selectedVideo)) ? "automatic-block" : ""} > */}
         <div className={(radioValue[0] === "manual" && !isApplied) ? "automatic-block" : ""} >
            <div id="mainvideo" >
              <iframe width="100%"  height="400" src={selectedVideo} />
            </div>
            <Box padding="300">
              <InlineGrid columns={"1fr auto"} gap="20px" alignItems="start">
                <div className="video-info">
                    <Text as="p" variant="headingMd" fontWeight="bold">
                      {videoMeta?.title || "Loading..."}
                    </Text>
                    <Text as="p">{videoMeta?.channel || ""}</Text>
                </div>
                
                {(activeVideoSummary) ? (
                  <div style={{ position: "relative", display: "inline-block" }} className="tooltip-wrapper" >
                    <style>
                      {`.summary-tooltip-container { display: none;  }
                      .tooltip-wrapper:hover .summary-tooltip-container {display: block;} `}
                    </style>
                    <Button icon={TextBlockIcon}>Video Summary</Button>
                    <div className="summary-tooltip-container">
                      <div style={{ position: "absolute",  right: "39px",  top: "calc(100% - 68px)",  width: "28px",  height: "28px",  background: "#ffffff",  border: "1px solid #dfdfdf",  transform: "rotate(314deg) scaleY(0.5)",  zIndex: -1, }}/>
                      <div
                        className="summary-tooltip"
                        style={{ position: "absolute", bottom: "50px", right: "-100%", transform: "translateX(-50%)", zIndex: 10, border: "1px solid #e1e1e1", borderRadius: "5px", backgroundColor: "#fff", padding: "10px", minWidth: "200px", maxWidth: "340px", textAlign: "center"
                        }}
                      >
                        <Text variant="bodyMd" as="p">
                          {activeVideoSummary}
                        </Text>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Button icon={TextBlockIcon} onClick={()=>{
                    generateSummary()
                  }}>Generate summary</Button>
                )}
              </InlineGrid>
              {/* Carousel */}
                {radioValue[0] === "auto" && (
                  <div className="preview-carousel" style={{ position: "relative" , marginTop: "20px" }}>
                  <button onClick={handlePrev} disabled={currentIndex === 0}
                    style={{  position: "absolute",  left: 0,  top: "50%",  transform: "translateY(-50%)",  zIndex: 2,  background: "white",  border: "1px solid #ccc",  cursor: "pointer",
                    }}
                  >
                    ‹
                  </button>
                  <div style={{ display: "flex", overflow: "hidden", margin: "0 30px"}} >
                    <div style={{  display: "flex",  transition: "transform 0.3s ease",  transform: `translateX(-${currentIndex * 33.33}%)`,  
                    width:"100%" }}
                    >
                      {allVideos.filter(Boolean).map((video, index) =>{ 
                        const videoIdMatch = video.match(
                          /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
                        );
                        const videoId = videoIdMatch ? videoIdMatch[1] : null;
                        const thumbnailUrl = videoId
                          ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                          : null;
                        
                        return(
                        <div key={"video"+ index} style={{ flex: "0 0 33.33%", padding: "0 4px", boxSizing: "border-box" }}>
                          <div key={index}
                            style={{
                              border: video === selectedVideo ? "3px solid #0070f3" : "2px solid #fff",
                              opacity: video === selectedVideo ? 1 : 0.8,
                              borderRadius: "8px",
                              overflow: "hidden",
                              cursor: "pointer",
                              padding: "2px",
                            }}
                            onClick={() => setSelectedVideo(video)}
                          >
                            <img src={thumbnailUrl} alt={`Video ${index}`} style={{borderRadius: "8px", width: "100%", height: "100px", objectFit: "cover" , display:"block"}} />
                          </div>
                        </div>
                      ) })}
                    </div>
                  </div>
                  <button  onClick={handleNext}  disabled={currentIndex >= allVideos.length - 3}
                    style={{  position: "absolute",  right: 0,  top: "50%",  transform: "translateY(-50%)",  zIndex: 2,  background: "white",  border: "1px solid #ccc",  cursor: "pointer",
                    }}
                  >
                    ›
                  </button>
                </div>
                )}
            </Box>
          <Box padding="300">
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
                  disabled={!isApplied}
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
                  Cancel
                </Button>
              </ButtonGroup>
            </InlineStack>
          </Box>
            </div>
          <TitleBar title={(modalProduct?.title || "-" ) + " , " + (modalProduct?.vendor || "" )}>
          </TitleBar>
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
