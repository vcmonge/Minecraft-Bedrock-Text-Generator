# Minecraft Bedrock Text Generator

A source editor for colored and styled text for Minecraft Bedrock Edition.

The editor keeps formatting codes visible while highlighting the text state they produce.

## Behavior

- Color changes preserve active bold and italic styles.
- Bold and italic remain active until `§r`.
- Unknown or incomplete codes remain editable and are marked as invalid.
- Enter, Tab, and pasted physical whitespace appear directly as the visible
  sequences `\n` and `\t`.
- Copy produces a single physical line without adding an implicit reset.

Open `index.html` directly in a browser. No build step is required.