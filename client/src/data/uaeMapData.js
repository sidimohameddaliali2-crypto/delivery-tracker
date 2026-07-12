// UAE Map data extracted from SimpleMaps
export const uaeMapData = {
  emirates: {
    AEAJ: {
      code: "AEAJ",
      name: "Ajman",
      lat: 25.4052,
      lng: 55.5136
    },
    AEAZ: {
      code: "AEAZ", 
      name: "Abu Dhabi",
      lat: 24.4539,
      lng: 54.3773
    },
    AEDU: {
      code: "AEDU",
      name: "Dubai", 
      lat: 25.2048,
      lng: 55.2708
    },
    AEFU: {
      code: "AEFU",
      name: "Fujairah",
      lat: 25.1288,
      lng: 56.3265
    },
    AERK: {
      code: "AERK",
      name: "Ras Al Khaimah",
      lat: 25.6741,
      lng: 55.9804
    },
    AESH: {
      code: "AESH",
      name: "Sharjah",
      lat: 25.3461,
      lng: 55.4209
    },
    AEUQ: {
      code: "AEUQ", 
      name: "Umm Al Quwain",
      lat: 25.5653,
      lng: 55.5533
    }
  },
  
  // UAE outline coordinates (approximate)
  outline: [
    [51.5, 22.5], [52.0, 22.6], [53.0, 22.8], [54.0, 23.0], [55.0, 23.5], 
    [55.5, 24.0], [56.0, 24.5], [56.5, 25.0], [56.8, 25.5], [56.5, 26.0],
    [56.0, 26.2], [55.5, 26.0], [55.0, 25.8], [54.5, 25.5], [54.0, 25.2],
    [53.5, 24.8], [53.0, 24.5], [52.5, 24.0], [52.0, 23.5], [51.5, 23.0], [51.5, 22.5]
  ],

  // Emirate boundaries (simplified)
  emirateBoundaries: {
    AEAZ: [ // Abu Dhabi - largest emirate
      [51.5, 22.5], [54.5, 22.8], [55.0, 24.0], [54.8, 24.5], [54.0, 24.8],
      [53.5, 24.5], [53.0, 24.0], [52.0, 23.5], [51.5, 23.0], [51.5, 22.5]
    ],
    AEDU: [ // Dubai
      [54.8, 24.5], [55.4, 24.7], [55.6, 25.3], [55.2, 25.4], [54.9, 25.1], [54.8, 24.5]
    ],
    AESH: [ // Sharjah
      [55.2, 25.1], [55.7, 25.2], [55.8, 25.6], [55.4, 25.7], [55.1, 25.4], [55.2, 25.1]
    ],
    AEAJ: [ // Ajman
      [55.3, 25.3], [55.6, 25.3], [55.7, 25.5], [55.4, 25.6], [55.3, 25.3]
    ],
    AEUQ: [ // Umm Al Quwain
      [55.4, 25.4], [55.7, 25.4], [55.8, 25.7], [55.5, 25.8], [55.4, 25.4]
    ],
    AERK: [ // Ras Al Khaimah
      [55.6, 25.5], [56.1, 25.6], [56.2, 26.1], [55.8, 26.2], [55.6, 25.8], [55.6, 25.5]
    ],
    AEFU: [ // Fujairah
      [56.1, 24.8], [56.5, 25.0], [56.6, 25.8], [56.2, 26.0], [56.0, 25.5], [56.1, 24.8]
    ]
  }
};

export default uaeMapData;