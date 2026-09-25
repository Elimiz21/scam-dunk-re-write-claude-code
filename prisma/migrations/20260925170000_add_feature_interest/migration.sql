CREATE TABLE "FeatureInterest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureInterest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureInterest_email_feature_key" ON "FeatureInterest"("email", "feature");
CREATE INDEX "FeatureInterest_feature_createdAt_idx" ON "FeatureInterest"("feature", "createdAt");
