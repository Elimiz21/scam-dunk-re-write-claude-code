ALTER TABLE "User"
  ADD COLUMN "firstTouchSource" TEXT,
  ADD COLUMN "firstTouchMedium" TEXT,
  ADD COLUMN "firstTouchCampaign" TEXT,
  ADD COLUMN "firstTouchReferrerHost" TEXT,
  ADD COLUMN "firstTouchClientId" TEXT;

CREATE INDEX "User_firstTouchSource_firstTouchMedium_idx"
  ON "User"("firstTouchSource", "firstTouchMedium");
