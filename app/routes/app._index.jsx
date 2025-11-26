import { useCallback, useEffect, useState, useMemo } from "react";
import { useLoaderData, useFetcher, redirect, useNavigate,} from "@remix-run/react";
import {Page,Layout,IndexTable,Text,Card,Thumbnail,InlineGrid,  Autocomplete, Box, Divider, FormLayout,
  useIndexResourceState, IndexFilters, useSetIndexFiltersMode, Badge, Link, ChoiceList, TextField,
  Banner, Spinner, Icon, InlineStack, PageActions, Button, BlockStack, ButtonGroup,
  ActionMenu,
  Tooltip,
} from "@shopify/polaris";
import { TitleBar, useAppBridge, Modal } from "@shopify/app-bridge-react";
import { AutomationIcon, CircleChevronLeftIcon, DeleteIcon, EditIcon, LogoYoutubeIcon, PlayCircleIcon, TargetIcon, TextBlockIcon, TextIndentIcon, ViewIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { formatPrompt, youtubeSummaryPrompt } from "./utils/prompts";

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
  // If no charge_id is present, fallback to any ACTIVE plan
  findCharge = subscriptions.nodes.find(sub => sub.status === "ACTIVE");
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

  const fetchTagsVendorsCategories = async (admin) => {
    const gql = `
      {
        productTags(first: 5000) {
          edges {
            node
          }
        }
        productVendors(first: 1000) {
          edges {
            node
          }
        }
        shop {
          allProductCategoriesList {
            id
            name
            fullName
            level
            isLeaf
          }
        }
      }
    `;
    const response = await admin.graphql(gql);
    const json = await response.json();

    const tags = json?.data?.productTags?.edges?.map(e => e.node) || [];
    const vendors = json?.data?.productVendors?.edges?.map(e => e.node) || [];
    const categories = json?.data?.shop?.allProductCategoriesList || [];

    return { tags, vendors, categories };
  };

  const { tags, vendors, categories } = await fetchTagsVendorsCategories(admin);

  return new Response(
    JSON.stringify({ tags, categories, vendors,  onboardingComplete , shopDomain, findCharge}),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();

  const { youtube_url, title, vendor, product_type } = body;

  const prompt = formatPrompt(youtubeSummaryPrompt, {
    youtube_url,
    title,
    vendor,
    product_type,
  });

  const bodyPayload = {
    model: "sonar-pro",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, // ✅ works server-side
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const errText = await response.text();
    return new Response(JSON.stringify({ error: errText }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await response.json();
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
};


export default function ProductTable() {
  const fetcher = useFetcher();
  const summaryFetcher = useFetcher(); 
  const { tags, categories, vendors, onboardingComplete , shopDomain, findCharge} = useLoaderData();
  const [products, setProducts] = useState([]);
  const [pageInfo, setPageInfo] = useState({ hasNextPage: false });
  const [lastCursor, setLastCursor] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [cursorStack, setCursorStack] = useState([]);
  const [currentCursor, setCurrentCursor] = useState(null);
  const [sortSelected, setSortSelected] = useState(["createdAt desc"]);
  const [demoVideo, setDemoVideo] = useState(null);
  const [category, setCategory] = useState([]);
  const [vendor, setVendor] = useState([]);
  const [status, setStatus] = useState(null);
  const [tag, setTag] = useState(null);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [modalProduct, setModalProduct] = useState(null);
  const [modalDelete, setModalDelete] = useState(null);
  const [editIsLoading, setEditIsLoading] = useState(false);
  const { mode, setMode } = useSetIndexFiltersMode();
  const onHandleCancel = () => {};
  const isLoading = fetcher.state !== "idle";
  const [queryValue, setQueryValue] = useState("");
  const [editVideoLink, seteditVideoLink] = useState("");
  const [videoMeta, setVideoMeta] = useState(null);
  // const [editVideo, seteditVideo] = useState(null);
  // const [appliedVideoLink, setAppliedVideoLink] = useState(null);
  const [isApplied, setIsApplied] = useState(false);
  const [editError, setEditError] = useState("");
  const [previewVideo, setPreviewVideo] = useState(modalProduct?.extendedInfo?.find((v) => v.isMain)?.videoUrl || "");
  const [pageShow, setPageShow] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [radioValue, setRadioValue] = useState(["auto"]);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [localSummary, setLocalSummary] = useState("");
  const [deletingIds, setDeletingIds] = useState([]);
  const [loadingProduct, setLoadingProduct] = useState({});
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const handleFiltersQueryChange = useCallback(
    (value) => setQueryValue(value),
    [],
  );

const generateSummary = async () => {
  setIsGeneratingSummary(true);
  try {
    summaryFetcher.submit(
      JSON.stringify({
        youtube_url: previewVideo,
        title: modalProduct?.title || modalProduct?.productTitle,
        vendor: modalProduct?.vendor,
        product_type: modalProduct?.productType,
      }),
      {
        method: "post",
        encType: "application/json",
      }
    );
  } catch (err) {
    console.error("Error generating summary:", err);
  }
};

useEffect(() => {
  if (summaryFetcher.data && summaryFetcher.state === "idle") {
    try {
      const result = summaryFetcher.data;
      const summaryText = result?.choices?.[0]?.message?.content;
      if (summaryText) {
        const parsed = JSON.parse(summaryText);
        console.log("🟢 Summary:", parsed.summary);
        console.log("🟢 Highlights:", parsed.highlights);
       setVideoMeta({
          ...videoMeta,
          summary: parsed.summary,
          highlights: parsed.highlights
       })
        setIsGeneratingSummary(false);
      }
    } catch (err) {
      console.error("Error parsing summary result:", err);
      setIsGeneratingSummary(false);
    }
  }
}, [summaryFetcher.data, summaryFetcher.state]);


 const activeVideoSummary = useMemo(() => {
  return modalProduct?.extendedInfo?.find(
      (info) => info.videoUrl === previewVideo
    )?.aiSummary || "";
  
}, [modalProduct, previewVideo]);

useEffect(()=>{
    console.log(modalProduct, "modalProduct");
  console.log(previewVideo,"previewVideo");
   console.log(modalProduct?.extendedInfo?.find(
      (info) => info.videoUrl == previewVideo
    ),"previewVideo");
    console.log(products,"products---")
}, [modalProduct, previewVideo]);

  useEffect(() => {
    if (radioValue[0] === "auto") {
      const autoMain = modalProduct?.metafield?.value || null;
      if (autoMain) {
           // clear manual override
        seteditVideoLink(autoMain);
        setPreviewVideo(autoMain);
        setIsApplied(false);
      }
    }
  }, [radioValue, modalProduct]);

useEffect(() => {
  if (previewVideo) {
    const trimmedLink = previewVideo.trim();
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
}, [previewVideo]);

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
}, [ demoVideo, category, vendor, status, tag, sortSelected, selectedTab, queryValue]);

useEffect(() => {
  if (fetcher.data) {
    setIsProductLoading(false);
    const newProducts = fetcher.data.edges.map((edge) => ({
      ...edge.node,
      cursor: edge.cursor,
    }));
    setProducts(newProducts);
    setLastCursor(fetcher.data.edges.at(-1)?.cursor || null);
    setPageInfo(fetcher.data.pageInfo);
  }
}, [fetcher.data]);

const [itemStrings, setItemStrings] = useState(["All","Active","Draft","Archived",]);
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
if (category && category.length > 0) {
    const selectedCategoryNames = category.map((id) => categories.find((cat) => cat.id === id)?.name).filter(Boolean)
  .join(", ");
  appliedFilters.push({
    key: "category",
    label: `Category: ${selectedCategoryNames}`,
    onRemove: () => setCategory([]),
  });
}
if (vendor && vendor.length > 0) {
  appliedFilters.push({
    key: "vendor",
    label: `Vendor: ${vendor}`,
    onRemove: () => setVendor([]),
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
        titleHidden
        title="Category"
        choices={categories.map((cat) => ({ label: cat.name, value: cat.id }))}
        selected={category}
        onChange={(selected) => setCategory(selected)}
        allowMultiple
      />
    ),
      shortcut: true,
  },
  {
    key: "vendor",
    label: "Vendor",
    filter: (
      <ChoiceList
        titleHidden
        title="Vendor"
        choices={vendors.map((v) => ({ label: v, value: v }))}
        selected={vendor || []} 
        onChange={(selected) => setVendor(selected)}
        allowMultiple
      />
    ),
      shortcut: true,
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
  // { label: "Title", value: "title asc", directionLabel: "A-Z" },
  // { label: "Title", value: "title desc", directionLabel: "Z-A" },
  { label: "Type", value: "type asc", directionLabel: "A-Z" },
  { label: "Type", value: "type desc", directionLabel: "Z-A" },
  { label: "Vendor", value: "vendor asc", directionLabel: "A-Z" },
  { label: "Vendor", value: "vendor desc", directionLabel: "Z-A" },
  { label: "Inventory", value: "inventory asc", directionLabel: "Low to High",},
  { label: "Inventory", value: "inventory desc", directionLabel: "High to Low",},
  { label: "Created", value: "createdAt asc", directionLabel: "Oldest first",},
  { label: "Created", value: "createdAt desc", directionLabel: "Newest first",},
  { label: "Last Updated", value: "updatedAtVideo asc", directionLabel: "Oldest first",},
  { label: "Last Updated", value: "updatedAtVideo desc", directionLabel: "Newest first",},
];
const { selectedResources, allResourcesSelected, handleSelectionChange } =  useIndexResourceState(products);
  
const handleVideo = async (ids) => {
  try {
    const inputIds = Array.isArray(ids) ? ids : selectedResources;
    const idsOnly = inputIds.map((id) => id.split("/").pop());
    const isSingle = idsOnly.length === 1;
    console.log(isSingle," single----");
    setIsVideoLoading(true);
    setLoadingProduct(prev => {
      const updated = { ...prev };
      idsOnly.forEach(pid => { updated[pid] = true });
      console.log(updated,"updated---hihih--")
      return updated;
    });
    // const updated = { ...prev };
    // idsOnly.forEach(pid => { updated[pid] = true });
    // console.log(updated,"updated---hihih--")
    
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

        if (Array.isArray(data.erroredProducts) && data.erroredProducts.length) {
          const titles = data.erroredProducts.map((p) => p.title || p.id).join(", ");
          shopify.toast.show(`Couldn't find videos for ${titles}`, { isError: true });
        }

        const updated = Array.isArray(data.updateProducts) ? data.updateProducts[0]: data.updateProducts;
 
        if (updated) {
          updatedProducts.push(data);
          // setProducts((prev) => [...prev, data]);
          fetchProducts(currentCursor ?? null, "next");
          console.log("toast should show");
          console.log(isSingle,"isSingle");
          shopify.toast.show(`Video generated for ${updated.productTitle || "product"}`, { isError: false });

        }

        if (isSingle) {
          console.log("Modal-----------",data);
          const foundProduct = products.find(
            (p) => p.id === `gid://shopify/Product/${updated?.productId}`
          );
          if (foundProduct) {
            setModalProduct(foundProduct);
            setPreviewVideo(updated.metafield?.value || updated.videoUrl);
            seteditVideoLink(updated.metafield?.value || updated.videoUrl);
            setIsApplied(false);
            setEditError("");
            setRadioValue(["auto"]);
            shopify.modal.show("demo-modal", { preventCloseOnOverlayClick: true });
          } else {
            console.warn(" No matching product found for modal preview");
          }
        }
      } catch (error) {
        console.error("Error fetching video for product", id, error);
        erroredProducts.push(id);
      } finally{
        console.log(loadingProduct,"loadingproduct hihih")
        setLoadingProduct(prev => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
      }
    }

    // Final summary for errored products
    if (erroredProducts.length) {
      console.log("toast should show error could not find//")
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

const handleDeleteVideo = async (product) => {
  setDeleteLoading(true);
  setDeletingIds(prev => [...prev, product.id]);
  try {
    const res = await fetch(`/api/delete-metafield`, {
      method: "POST",
      body: JSON.stringify({
        productId: product.id,
        // tags: product.tags,
      }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await res.json();
    if (result.success) {
      shopify.modal.hide("delete-modal");
      shopify.modal.hide("demo-modal");
      setDeleteLoading(false);
      setDeletingIds(prev => prev.filter(x => x !== product.id));
      fetchProducts(currentCursor ?? null, "next");
      shopify.toast.show(`Video deleted for ${product.title}`);
    }
  } catch (error) {
    shopify.modal.hide("demo-modal");
    shopify.modal.hide("delete-modal");
    setDeleteLoading(false);
    console.error("Failed to delete metafield:", error);
    setDeletingIds(prev => prev.filter(x => x !== product.id));
  }
};

const bulkDeleteVideos = async () => {
  setDeleteLoading(true);
  setDeletingIds(selectedResources);
  try {
    const res = await fetch(`/api/delete-metafield`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productIds: selectedResources
      })
    });

    const result = await res.json();
    if (result.success) {
      shopify.modal.hide("delete-modal");
      setDeleteLoading(false);
      fetchProducts(currentCursor ?? null, "next");
      shopify.toast.show(`Videos deleted successfully`);
      setDeletingIds([]);
    }
  } catch (e) {
    setDeleteLoading(false);
    setDeletingIds([]);
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
        summary: videoMeta?.summary,
        highlights: videoMeta?.highlights,
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

    // ✅ Always return standardized embed format
    const formattedLink = `https://youtube.com/embed/${videoId}`;

    return { success: true, videoId, trimmedLink: formattedLink };
  } catch (error) {
    console.error("YouTube validation error:", error);
    return { success: false, message: "Could not verify video. Please try again." };
  }
};

const handleBuyPlan = () => {
   console.log(shopDomain, "shopDomain");
       if (shopDomain) {
      const shopName = shopDomain.replace(".myshopify.com", "");
          window.top.location.href = `https://admin.shopify.com/store/${shopName}/charges/autovid/pricing_plans`
    }
}

const canBulkDelete = products.some(
  p => selectedResources.includes(p.id) && p?.metafield?.value
);
const promotedBulkActions = [
  {
    content: "Find Videos",
    onAction: handleVideo,
    disabled: isVideoLoading || selectedResources.length === 0,
    loading: isVideoLoading,
  },
  {
    content: "Delete Videos",
    onAction: () => shopify.modal.show("bulk-delete-modal"),
    destructive: true,
    disabled: !canBulkDelete || deleteLoading,
    loading: deleteLoading,
  }
];


  return (
    <>
    {!findCharge && pageShow? (
    <Page title="Subscription Required">
        <Banner
          title="No active subscription found" status="critical"
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
                setCategory([]);
                setVendor([]);
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
            {/* {isVideoLoading && (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <Spinner
                  size="small"
                  accessibilityLabel="Loading AI video generation"
                />
                <Text variant="bodyMd" alignment="center">
                  Generating videos...
                </Text>
              </div>
            )} */}
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
                { title: <InlineGrid gap="100" columns={"auto 1fr"} alignItems="center" ><Icon source={PlayCircleIcon} />Demo video</InlineGrid> },
                // { title: "Action" },
                { title: "Last Upload" },
                // { title: "Video Source" },
                // { title: "Video Status" },
                // { title: "Category" },
                { title: "Vendor" },
                { title: "Type" },
                { title: "Status" },
                { title: "Inventory" },
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
                      : "";
                const videoSourceValue = product?.video_source?.value;
                const status = product?.metafield?.value || "No video";
                const numericProductId = product.id.split("/").pop();
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
                      <InlineStack align="" gap="200" blockAlign="center">
                        
                      {loadingProduct[numericProductId] ? (
                        <Spinner size="small" />
                      ) :product?.metafield?.value ? (
                        <Button
                          // icon={LogoYoutubeIcon}
                          // tone="success"
                          // variant="primary"
                          onClick={() => {
                            setModalProduct(product);
                            setPreviewVideo(product?.metafield?.value);
                            seteditVideoLink(product?.metafield?.value);
                            setIsApplied(false); 
                            setEditError(""); 
                            setModalDelete(product);
                            shopify.modal.show("demo-modal", {  preventCloseOnOverlayClick: true,});
                            setRadioValue(["auto"])
                          }}
                        >
                          Preview/edit
                        </Button>
                      ) : (
                        <InlineGrid  columns={"auto auto"} gap="200" alignItems="center">
                          <Button icon={TargetIcon} onClick={() => handleVideo([product.id])}>Get Video</Button>
                          {/* <span onClick={()=>{}}<Icon source={EditIcon}></Icon> */}
                        </InlineGrid>
                      )}
                      {videoSourceValue && 
                      // <div style={{padding: '5px'}}>
                      //   <Tooltip active content={(videoSourceValue==="AUTO")?"Found automatically":"Added manually"}>
                      //     <Icon source={(videoSourceValue==="AUTO")?AutomationIcon:TextIndentIcon}/>
                      //   </Tooltip>
                      // </div>
                      <div style={{ position: 'relative', display: 'inline-block' }}  className="video-tooltip-wrapper">
                        <style>
                          {` .videosrc-tooltip { display: none;}  .video-tooltip-wrapper:hover .videosrc-tooltip { display: block; }`}
                        </style>
                        <div style={{ padding: '5px' }}>
                          <Icon source={(videoSourceValue==="AUTO")?AutomationIcon:TextIndentIcon} />
                        </div>
                        <div className="videosrc-tooltip">
                          <div style={{  position: 'absolute',  bottom: 'calc(100% - 2px)',  left: '50%',
                              width: '12px',  height: '12px',  background: '#fff',boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                              border: '1px solid #e1e1e1', transform: 'translateX(-50%) rotate(45deg)', zIndex: 1,
                            }}
                          />
                          <div style={{ position: 'absolute', bottom: '115%', left: '50%', transform: 'translateX(-50%)', border: '1px solid #e1e1e1',
                              borderRadius: '6px', backgroundColor: '#fff', padding: '5px 7px', minWidth: '123px', textAlign: 'center',
                              zIndex: 10, boxShadow: '0 2px 6px rgba(0,0,0,0.15)', fontSize: '13px', color: '#202223',
                            }}
                          >
                            {(videoSourceValue==="AUTO")?"Found automatically":"Added manually"}
                          </div>
                        </div>
                      </div>
                      }
                      {deletingIds.includes(product.id) ? (<Spinner size="small" />) :
                      (product?.metafield?.value && (
                        <button
                          onClick={() => {
                            setModalDelete(product);
                            shopify.modal.show("delete-modal");
                          }}
                          title="Delete Video"
                          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, }}
                        >
                          <Icon source={DeleteIcon} tone="critical"/>
                        </button>
                      ))}
                      </InlineStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {product?.lastUpdatedAt
                        ? new Date(product.lastUpdatedAt).toLocaleDateString("en-US", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </IndexTable.Cell>
                    <IndexTable.Cell>{product?.vendor}</IndexTable.Cell>
                    <IndexTable.Cell> {product?.productType}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge size="small"
                        tone={ product.status === "ACTIVE"   ? "success"
                            : product.status === "DRAFT" ? "info": ""
                        }
                      >
                        {product.status === "ACTIVE"? "Active"
                          : product.status === "DRAFT" ? "Draft"
                          : product.status === "ARCHIVED" || product.status === "ARCHIVE"
                          ? "Archived" : product.status}
                      </Badge>
                    </IndexTable.Cell>
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
                          button#cancel-button {z-index: 2;}
                          .automatic-block .tooltip-wrapper:hover .summary-tooltip-container{
                            display: none;
                          }
                        `}
                      </style>
                      {product?.onlineStorePreviewUrl && (
                        <Button  icon={ViewIcon}   onClick={(e) => { e.stopPropagation(); }}  
                        variant="tertiary" url={product.onlineStorePreviewUrl} target="_blank"
                        />
                      )}
                    </div>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>
          </Card>
          <Box paddingBlock={300}> <Divider /></Box>
        </Layout.Section>
      </Layout>
      <Modal id="demo-modal">
        <Box padding="300" paddingBlockStart="200">
          <FormLayout>
            <InlineStack align="end" >
              <Button onClick={() => {setRadioValue(radioValue[0] === "auto" ? ["manual"] : ["auto"])}}>
                {radioValue[0] === "auto" ? "Switch to manual editor" : "Switch to automated mode"}
              </Button>
            </InlineStack>
          {radioValue[0] === "manual" && (
            <InlineStack gap="200" align="start" blockAlign="start">
              <Box  minWidth="80%">
                <TextField
                  value={editVideoLink}
                  error={editError}
                  placeholder="Youtube video link"
                  onChange={(value) => {
                    seteditVideoLink(value);
                    setEditError(""); 
                    // setPreviewVideo(result.trimmedLink);
                    document.querySelector('.automatic-block')?.classList.remove('automatic-block');
                    // clear error on typing
                  }}
                  autoComplete="off"
                  helpText={editError ? "" : "Format Example: https://youtube.com/embed/videoId"}
                />
              </Box>
              <Button variant="primary" tone="success" onClick={async () => {
                  const result = await validateYouTubeVideo(editVideoLink);
                  if (!result.success) {
                    setEditError(result.message);
                    return;
                  }
                  // setAppliedVideoLink(result.trimmedLink);
                  setPreviewVideo(result.trimmedLink);
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
        <div className={(radioValue[0] === "manual" && !isApplied) ? "automatic-block" : ""} >
          <div id="mainvideo" >
            {previewVideo && <iframe width="100%"  height="400" src={previewVideo} /> }
          </div>
          <Box padding="300">
            <InlineGrid columns={"1fr auto"} gap="200" alignItems="start">
              <div className="video-info">
                  <Text as="p" variant="headingMd" fontWeight="bold">
                    {videoMeta?.title || "Loading..."}
                  </Text>
                  <Text as="p">{videoMeta?.channel || ""}</Text>
              </div>
              
              {(activeVideoSummary || videoMeta?.summary) ? (
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
                        {activeVideoSummary || videoMeta?.summary}
                      </Text>
                    </div>
                  </div>
                </div>
              ) : (
                <Button icon={TextBlockIcon} loading={isGeneratingSummary}
                onClick={()=>{ generateSummary(); }}>Generate summary</Button>
              )}
            </InlineGrid>
            {/* Carousel */}
          </Box>
        <Box padding="300">
          <InlineStack wrap={false} align="end">
            <ButtonGroup>
              <Button variant="primary" loading={editIsLoading} disabled={!isApplied}
                onClick={() => {
                  console.log(modalProduct, editVideoLink, radioValue);
                  handleEditVideo(modalProduct, editVideoLink, radioValue);
                }}
              >
                Update
              </Button>
              <Button id="cancel-button"
                onClick={() => {
                shopify.modal.hide("demo-modal");
                // setAppliedVideoLink(null); 
                setModalProduct(null);
                setPreviewVideo(null);
                setIsApplied(false);
                setEditError(""); 
              }}>
                Cancel
              </Button>
            </ButtonGroup>
          </InlineStack>
        </Box>
        </div>
        <TitleBar title={(modalProduct?.title || modalProduct?.productTitle || "-" ) + " , " + (modalProduct?.vendor || "" )}>
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
      <Modal id="bulk-delete-modal">
        {console.log(deleteLoading,"setDeleteLoading---")}
        <TitleBar title="Delete Videos"></TitleBar>
        <Page>
          <BlockStack gap="200">
            <Text variant="bodyLg" as="p">
              Are you sure you want to delete videos for {selectedResources.length} products?
            </Text>
          </BlockStack>
          <br/>
          <InlineStack wrap={false} align="end">
            <ButtonGroup>
              <Button
                tone="critical"
                variant="primary"
                loading={deleteLoading}
                onClick={() => {
                  shopify.modal.hide("bulk-delete-modal");
                  bulkDeleteVideos();
                }}
              >
                Delete
              </Button>
              <Button onClick={() => shopify.modal.hide("bulk-delete-modal")}>
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
