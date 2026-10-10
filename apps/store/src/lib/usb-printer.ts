/**
 * WebUSB printer service for GP-3120TUD and compatible TSPL thermal printers.
 *
 * Sends raw TSPL commands directly to the printer via USB — no print dialog,
 * no OS print queue. Silent, native, automated.
 *
 * Usage:
 *   const printer = new UsbThermalPrinter();
 *   await printer.connect();
 *   await printer.send(tsplData);
 *   await printer.disconnect();
 *
 * Browser support: Chrome/Edge/Opera (WebUSB). Falls back gracefully
 * with isSupported flag.
 */

export interface PrinterInfo {
  connected: boolean;
  vendorId?: number;
  productId?: number;
  productName?: string;
  manufacturerName?: string;
}

type Listener = (info: PrinterInfo) => void;

export class UsbThermalPrinter {
  private device: USBDevice | null = null;
  private endpointOut: number | null = null;
  private listeners: Set<Listener> = new Set();

  static get isSupported(): boolean {
    return typeof navigator !== "undefined" && "usb" in navigator;
  }

  get info(): PrinterInfo {
    if (!this.device) return { connected: false };
    return {
      connected: true,
      vendorId: this.device.vendorId,
      productId: this.device.productId,
      productName: this.device.productName || undefined,
      manufacturerName: this.device.manufacturerName || undefined,
    };
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    const info = this.info;
    this.listeners.forEach((fn) => fn(info));
  }

  /** Prompt user to select and connect to a USB printer via browser picker. */
  async connect(): Promise<void> {
    if (!UsbThermalPrinter.isSupported) {
      throw new Error("WebUSB not supported. Use Chrome or Edge.");
    }

    const device = await navigator.usb.requestDevice({
      filters: [{ classCode: 7 }], // USB printer class
    });

    await this.openDevice(device);
  }

  /**
   * Reconnect to a previously-paired device without the picker.
   * Call after page reload when permission was already granted.
   */
  async reconnect(): Promise<boolean> {
    if (!UsbThermalPrinter.isSupported) return false;
    const devices = await navigator.usb.getDevices();
    if (devices.length === 0) return false;
    await this.openDevice(devices[0]);
    return true;
  }

  private async openDevice(device: USBDevice): Promise<void> {
    await device.open();
    const conf = device.configurations?.[0];
    if (!conf) throw new Error("No USB configuration found");
    await device.selectConfiguration(conf.configurationValue);

    // Find bulk OUT endpoint for sending data
    for (const iface of conf.interfaces) {
      for (const alt of iface.alternates) {
        const outEp = alt.endpoints?.find(
          (ep) => ep.direction === "out" && (ep.type === "bulk" || ep.type === "interrupt"),
        );
        if (outEp) {
          this.endpointOut = outEp.endpointNumber;
          await device.claimInterface(iface.interfaceNumber);
          break;
        }
      }
      if (this.endpointOut) break;
    }

    if (!this.endpointOut) {
      await device.close();
      throw new Error("Could not find USB OUT endpoint on printer");
    }

    this.device = device;
    this.notify();

    // Clear state on disconnect
    navigator.usb.addEventListener("disconnect", (e: USBConnectionEvent) => {
      if (e.device === this.device) {
        this.device = null;
        this.endpointOut = null;
        this.notify();
      }
    });
  }

  async disconnect(): Promise<void> {
    if (!this.device) return;
    try {
      await this.device.close();
    } catch {
      /* ignore */
    }
    this.device = null;
    this.endpointOut = null;
    this.notify();
  }

  /** Send raw TSPL bytes to the printer. */
  async send(data: Uint8Array): Promise<void> {
    if (!this.device || this.endpointOut === null) {
      throw new Error("Printer not connected");
    }
    const chunkSize = 1024;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await this.device.transferOut(this.endpointOut, chunk);
    }
  }

  /** High-level: build and print a TSPL label in one call. */
  async printLabel(tsplData: Uint8Array): Promise<void> {
    await this.send(tsplData);
  }
}
