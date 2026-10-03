/** Compensated summation reduces rounding error when many weights are added. */
export class Sum {
  value = 0;
  private correction = 0;

  add(value: number): void {
    const adjusted = value - this.correction;
    const next = this.value + adjusted;
    this.correction = (next - this.value) - adjusted;
    this.value = next;
  }
}
