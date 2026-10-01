# Synthetic independent codec fixtures

These96×64 fixtures were generated locally with Python Pillow from deterministic pixel formulas, without EXIF, ICC, comments or user photographs. RGB values are `(13x+7y)%256`, `(3x+17y)%256`, `(19x+5y)%256`; grayscale uses the first formula. Both use JPEG quality70; RGB is progressive and grayscale is baseline. They check actual strict entropy decoding against upstream jpeg-js0.4.4 independently of that package's fixture encoder. They do not attest native Expo or browser production output.
