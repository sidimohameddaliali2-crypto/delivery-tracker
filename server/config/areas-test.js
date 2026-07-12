// Test file
export const TEST_ARRAY = [
  {
    keywords: ['test1', 'test2'],
    area: 'Test Area'
  }
];

export function testFunction() {
  console.log('TEST_ARRAY type:', typeof TEST_ARRAY);
  console.log('TEST_ARRAY is array:', Array.isArray(TEST_ARRAY));
  console.log('TEST_ARRAY length:', TEST_ARRAY?.length);
  
  for (const item of TEST_ARRAY) {
    console.log('Item:', item);
  }
  
  return 'success';
}
