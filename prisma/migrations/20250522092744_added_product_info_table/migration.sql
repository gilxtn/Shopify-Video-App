-- CreateEnum
CREATE TYPE "SourceMethod" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "ProductExtendedInfo" (
    "id" SERIAL NOT NULL,
    "productId" BIGINT NOT NULL,
    "shop" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "highlights" TEXT NOT NULL,
    "source_method" "SourceMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductExtendedInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductExtendedInfo_productId_key" ON "ProductExtendedInfo"("productId");
