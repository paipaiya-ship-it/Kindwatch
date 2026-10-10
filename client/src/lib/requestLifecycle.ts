// A response can update the screen only while its request owns this lifecycle.
export class RequestLifecycle {
  private current: AbortController | null = null;

  get active() { return this.current !== null; }
  begin() {
    this.cancel();
    return this.current = new AbortController();
  }
  isCurrent(controller: AbortController) { return this.current === controller; }
  finish(controller: AbortController) {
    if (!this.isCurrent(controller)) return false;
    this.current = null;
    return true;
  }
  cancel() {
    this.current?.abort();
    this.current = null;
  }
}
