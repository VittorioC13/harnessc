const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL_MS = 80;

export class Spinner {
  private timer: ReturnType<typeof setInterval> | undefined;
  private frame = 0;

  constructor(private readonly text: string) {}

  start(): void {
    if (!process.stdout.isTTY) {
      console.log(this.text);
      return;
    }
    this.timer = setInterval(() => {
      process.stdout.write(`\r${FRAMES[this.frame % FRAMES.length]} ${this.text}`);
      this.frame++;
    }, FRAME_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      process.stdout.write(`\r${" ".repeat(this.text.length + 2)}\r`);
    }
  }
}
