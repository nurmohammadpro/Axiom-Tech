"use client";

import { Card } from "@/components/dashboard/dashboard-shell";

export default function Hardware() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm font-medium">Connected devices</div>
          <div className="py-8 text-center text-sm text-muted-foreground">
            No devices connected yet. Pair a printer, scanner, or terminal to get started.
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium">Digital signage</div>
          <div className="py-8 text-center text-sm text-muted-foreground">
            No signage displays configured.
          </div>
        </Card>
      </div>

      <div className="mt-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Media library</div>
          </div>
          <div className="mt-3 py-8 text-center text-sm text-muted-foreground">
            No media uploaded yet.
          </div>
        </Card>
      </div>
    </>
  );
}
