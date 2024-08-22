let optionalNumber: number | undefined = 123;
let optionalString: string | undefined = '123';
if (optionalNumber === optionalString)
  process.exit(1);

let unionNumberString: number | string | undefined;
if (unionNumberString)
  process.exit(2);
if (unionNumberString !== null)
  process.exit(2);
if (unionNumberString !== undefined)
  process.exit(2);
if (unionNumberString === optionalNumber)
  process.exit(2);

optionalNumber = undefined;
if (optionalNumber)
  process.exit(3);
if (optionalNumber !== null)
  process.exit(3);
if (optionalNumber !== undefined)
  process.exit(3);
if (optionalNumber !== unionNumberString)
  process.exit(3);

unionNumberString = '123';
if (!unionNumberString)
  process.exit(4);
if (unionNumberString === null)
  process.exit(4);
if (unionNumberString === undefined)
  process.exit(4);
if (unionNumberString !== optionalString)
  process.exit(4);

const arr1 = [1, 2, 3, 4];
const arr2 = arr1;
if (arr1 !== arr2)
  process.exit(5);
