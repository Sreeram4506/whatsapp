-- AlterTable
ALTER TABLE "Citizen" ADD COLUMN     "bsuid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Citizen_tenantId_bsuid_key" ON "Citizen"("tenantId", "bsuid");
