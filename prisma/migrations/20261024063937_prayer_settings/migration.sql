-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PrayerOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "prayer" TEXT NOT NULL,
    "time" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PrayerOverride_date_prayer_key" ON "PrayerOverride"("date", "prayer");
