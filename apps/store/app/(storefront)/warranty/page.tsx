"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWarrantyValidation } from "@/lib/hooks";
import { Shield, Search, Calendar, AlertCircle, CheckCircle } from "lucide-react";

export default function WarrantyLookup() {
  const [identifier, setIdentifier] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: result, isLoading, error } = useWarrantyValidation(searchQuery);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (identifier.trim()) {
      setSearchQuery(identifier.trim());
    }
  };

  return (
    <div className="min-h-screen bg-surface py-12">
      <div className="mx-auto max-w-2xl px-6">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Warranty Status Lookup</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your warranty status by entering your IMEI, serial number, or unit code
          </p>
        </div>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Enter IMEI, Serial Number, or Unit Code"
              className="flex-1 rounded-sm border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" disabled={isLoading || !identifier.trim()}>
              {isLoading ? (
                "Checking..."
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Check Status
                </>
              )}
            </Button>
          </div>
        </form>

        {error && (
          <Card className="p-6 mb-6 bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-red-900">Error Checking Warranty</h3>
                <p className="mt-1 text-sm text-red-700">
                  {error instanceof Error ? error.message : "Unable to check warranty status"}
                </p>
              </div>
            </div>
          </Card>
        )}

        {result && result.warranty && (
          <Card className="p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Warranty Information</h2>
                <p className="text-sm text-muted-foreground">Unit Code: {result.unit.unitCode}</p>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                  result.warranty.status === "active"
                    ? "bg-green-100 text-green-700"
                    : result.warranty.status === "expired"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {result.warranty.status === "active" ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {result.warranty.status.charAt(0).toUpperCase() + result.warranty.status.slice(1)}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Warranty Start
                  </p>
                  <p className="text-sm font-medium">
                    {new Date(result.warranty.startsAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Warranty End
                  </p>
                  <p className="text-sm font-medium">
                    {new Date(result.warranty.endsAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {result.warranty.status === "active" && (
                <div className="bg-surface rounded-sm p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Days Remaining</span>
                    </div>
                    <span className="text-lg font-semibold">{result.warranty.remainingDays}</span>
                  </div>
                </div>
              )}

              {result.warranty.status === "expired" && (
                <div className="bg-red-50 rounded-sm p-4">
                  <p className="text-sm text-red-700">
                    Your warranty has expired. Please contact our support team for assistance.
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {result && !result.warranty && (
          <Card className="p-6 mb-6 bg-yellow-50 border-yellow-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-yellow-900">No Warranty Information Found</h3>
                <p className="mt-1 text-sm text-yellow-700">
                  This unit does not have warranty information on file. Please contact our customer
                  service for assistance.
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="text-center text-sm text-muted-foreground">
          <p>Need help? Contact our customer service</p>
          <p className="mt-1">
            <a href="tel:+8801700000000" className="text-primary hover:underline">
              +880 1700-000000
            </a>{" "}
            or{" "}
            <a href="mailto:support@playstore.com" className="text-primary hover:underline">
              support@playstore.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
