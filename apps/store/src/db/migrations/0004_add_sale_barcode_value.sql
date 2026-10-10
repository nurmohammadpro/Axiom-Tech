-- Add barcodeValue column to sales table for short scannable barcodes
ALTER TABLE "sales" ADD COLUMN "barcode_value" text UNIQUE;