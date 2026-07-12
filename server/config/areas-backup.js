// Predefined list of areas/zones for automatic mapping
// The system will search for these keywords in delivery addresses
// and automatically set the zone field accordingly

const AREA_MAPPINGS = [
    
  {
    keywords: [
      'al muteena', 'almuteena', 'muteena',
      'al muteena 1', 'almuteena1', 'muteena1',
      'al muteena one', 'muteena one'
    ],
    area: 'Al Muteena'
  },
  {
    keywords: [
      'burj khalifa', 'burjkhalifa',
      'khalifa tower', 'burj khalifa tower'
    ],
    area: 'Burj Khalifa'
  },
  {
    keywords: [
      'al warsan 1', 'alwarsan1', 'warsan 1', 'warsan1',
      'al warsan one', 'warsan one'
    ],
    area: 'Al Warsan 1'
  },
  {
    keywords: [
      'al thanyah 5', 'althanyah5', 'thanyah 5', 'thanyah5',
      'al thanyah five', 'thanyah five'
    ],
    area: 'Al Thanyah 5'
  },
  {
    keywords: [
      'meaisem 1', 'meaisem1',
      'meaisem one'
    ],
    area: 'Meaisem 1'
  },
  {
    keywords: [
      'marsa dubai', 'marsadubai', 'marsa'
    ],
    area: 'Marsa Dubai'
  },
  {
    keywords: [
      'jabal ali 1', 'jabalali1', 'jebel ali 1', 'jebeli ali 1',
      'jabal ali one', 'jebel ali one'
    ],
    area: 'Jabal Ali 1'
  },
  {
    keywords: [
      'al khairan 1', 'alkhairan1', 'khairan 1', 'khairan1',
      'al khairan one', 'khairan one'
    ],
    area: 'Al Khairan 1'
  },
  {
    keywords: [
      'al thanyah 1', 'althanyah1', 'thanyah 1', 'thanyah1',
      'al thanyah one', 'thanyah one'
    ],
    area: 'Al Thanyah 1'
  },
  {
    keywords: [
      'nadd hessa', 'naddhessa', 'nad hessa', 'nadhessa'
    ],
    area: 'Nadd Hessa'
  },
  {
    keywords: [
      'al jadaf', 'aljadaf', 'jadaf'
    ],
    area: 'Al Jadaf'
  },
  {
    keywords: [
      'madinat al mataar', 'madinatalmataar', 'al mataar', 'mataar'
    ],
    area: 'Madinat Al Mataar'
  },
  {
    keywords: [
      'dubai investment park 1', 'dubaiinvestmentpark1', 'dip 1', 'dip1'
    ],
    area: 'Dubai Investment Park 1'
  },
  {
    keywords: [
      'wadi al safa 6', 'wadialsafa6', 'safa 6', 'safa6',
      'wadi al safa six', 'safa six'
    ],
    area: 'Wadi Al Safa 6'
  },
  {
    keywords: [
      'jumeirah 1', 'jumeirah1',
      'jumeirah one'
    ],
    area: 'Jumeirah 1'
  },
  {
    keywords: [
      'al barsha south 3', 'albarshasouth3', 'barsha south 3', 'barshasouth3',
      'al barsha south three', 'barsha south three'
    ],
    area: 'Al Barsha South 3'
  },
  {
    keywords: [
      'al yufrah 3', 'alyufrah3', 'yufrah 3', 'yufrah3',
      'al yufrah three', 'yufrah three'
    ],
    area: 'Al Yufrah 3'
  },
  {
    keywords: [
      'al hebiah 3', 'alhebiah3', 'hebiah 3', 'hebiah3',
      'al hebiah three', 'hebiah three'
    ],
    area: 'Al Hebiah 3'
  },
  {
    keywords: [
      'business bay', 'businessbay', 'bay square', 'biz bay'
    ],
    area: 'Business Bay'
  },
  {
    keywords: [
      'al hebiah 5', 'alhebiah5', 'hebiah 5', 'hebiah5',
      'al hebiah five', 'hebiah five'
    ],
    area: 'Al Hebiah 5'
  },
  {
    keywords: [
      'hadaeq sheikh mohammed bin rashid',
      'hadaeq sheikh mohammed',
      'sheikh mohammed gardens',
      'sheikh mohammed bin rashid city'
    ],
    area: 'Hadaeq Sheikh Mohammed Bin Rashid'
  },
  {
    keywords: [
      'al yelayiss 2', 'alyelayiss2', 'yelayiss 2', 'yelayiss2',
      'al yelayiss two', 'yelayiss two'
    ],
    area: 'Al Yelayiss 2'
  },
  {
    keywords: [
      'al thanyah 3', 'althanyah3', 'thanyah 3', 'thanyah3',
      'al thanyah three', 'thanyah three'
    ],
    area: 'Al Thanyah 3'
  },
  {
    keywords: [
      'al barsha south 4', 'albarshasouth4', 'barsha south 4', 'barshasouth4',
      'al barsha south four', 'barsha south four'
    ],
    area: 'Al Barsha South 4'
  },
  {
    keywords: [
      'al waheda', 'alwaheda', 'waheda'
    ],
    area: 'Al Waheda'
  },
  {
    keywords: [
      'al thanayah 4', 'althanayah4', 'thanayah 4', 'thanayah4',
      'al thanayah four', 'thanayah four'
    ],
    area: 'Al Thanayah 4'
  },
  {
    keywords: [
      'al barsha 3', 'albarsha3', 'barsha 3', 'barsha3',
      'al barsha three', 'barsha three'
    ],
    area: 'Al Barsha 3'
  },
  {
    keywords: [
      'al suq al kabeer', 'alsuqalkabeer', 'suq al kabeer', 'kabeer'
    ],
    area: 'Al Suq Al Kabeer'
  },
  {
    keywords: [
      'al barsha south 5', 'albarshasouth5', 'barsha south 5', 'barshasouth5',
      'al barsha south five', 'barsha south five'
    ],
    area: 'Al Barsha South 5'
  },
  {
    keywords: [
      'al hebiah 4', 'alhebiah4', 'hebiah 4', 'hebiah4',
      'al hebiah four', 'hebiah four'
    ],
    area: 'Al Hebiah 4'
  },
  {
    keywords: [
      'wadi al safa 5', 'wadialsafa5', 'safa 5', 'safa5',
      'wadi al safa five', 'safa five'
    ],
    area: 'Wadi Al Safa 5'
  },
  {
    keywords: [
      'al hebiah 6', 'alhebiah6', 'hebiah 6', 'hebiah6',
      'al hebiah six', 'hebiah six'
    ],
    area: 'Al Hebiah 6'
  },
  {
    keywords: [
      'wadi al safa 3', 'wadialsafa3', 'safa 3', 'safa3',
      'wadi al safa three', 'safa three'
    ],
    area: 'Wadi Al Safa 3'
  },
  {
    keywords: [
      'wadi al safa 4', 'wadialsafa4', 'safa 4', 'safa4',
      'wadi al safa four', 'safa four'
    ],
    area: 'Wadi Al Safa 4'
  },
  {
    keywords: [
      'mirdif', 'mirdiff'
    ],
    area: 'Mirdif'
  },
  {
    keywords: [
      'al hebiah 1', 'alhebiah1', 'hebiah 1', 'hebiah1',
      'al hebiah one', 'hebiah one'
    ],
    area: 'Al Hebiah 1'
  },
  {
    keywords: [
      'al merkadh', 'almerkadh', 'merkadh'
    ],
    area: 'Al Merkadh'
  },
  {
    keywords: [
      'wadi al safa 2', 'wadialsafa2', 'safa 2', 'safa2',
      'wadi al safa two', 'safa two'
    ],
    area: 'Wadi Al Safa 2'
  },
  {
    keywords: [
      'abu hail', 'abuhail', 'hail'
    ],
    area: 'Abu Hail'
  },
  {
    keywords: [
      'mankhool', 'al mankhool'
    ],
    area: 'Mankhool'
  },
  {
    keywords: [
      'palm jumeirah', 'palmjumeirah', 'the palm', 'the palm jumeirah'
    ],
    area: 'Palm Jumeirah'
  },
  {
    keywords: [
      'zaabeel 2', 'zaabeel2', 'zabeel 2', 'zabeel2',
      'zaabeel two', 'zabeel two'
    ],
    area: 'Zaabeel 2'
  },
  {
    keywords: [
      'jumeirah 3', 'jumeirah3',
      'jumeirah three'
    ],
    area: 'Jumeirah 3'
  },
  {
    keywords: [
      'al saffa 2', 'alsaffa2', 'saffa 2', 'saffa2',
      'al saffa two', 'saffa two'
    ],
    area: 'Al Saffa 2'
  },
  {
    keywords: [
      'nad al hamar', 'nadalhamar', 'al hamar', 'hamar'
    ],
    area: 'Nad Al Hamar'
  },
  {
    keywords: [
      'dubai investment park 2', 'dubaiinvestmentpark2', 'dip 2', 'dip2'
    ],
    area: 'Dubai Investment Park 2'
  },
  {
    keywords: [
      'al barsha south 2', 'albarshasouth2', 'barsha south 2', 'barshasouth2',
      'al barsha south two', 'barsha south two'
    ],
    area: 'Al Barsha South 2'
  },
  {
    keywords: [
      'wadi al shabak', 'wadialshabak', 'al shabak', 'shabak'
    ],
    area: 'Wadi Al Shabak'
  },
  {
    keywords: [
      'al safoh 1', 'alsafoh1', 'safoh 1', 'safoh1',
      'al safoh one', 'safoh one'
    ],
    area: 'Al Safoh 1'
  },
  {
    keywords: [
      'al mizhar 1', 'almizhar1', 'mizhar 1', 'mizhar1',
      'al mizhar one', 'mizhar one'
    ],
    area: 'Al Mizhar 1'
  },
  {
    keywords: [
      'al aweer 1', 'alaweer1', 'aweer 1', 'aweer1',
      'al aweer one', 'aweer one'
    ],
    area: 'Al Aweer 1'
  },
  {
    keywords: [
      'um suqaim 3', 'umsuqaim3', 'um suqeim 3', 'umsuqeim3',
      'um suqaim three'
    ],
    area: 'Um Suqaim 3'
  },
  {
    keywords: [
      'madinat dubai almelaheyah', 'madinatdubai almelaheyah',
      'madinat almelaheyah'
    ],
    area: 'Madinat Dubai Almelaheyah'
  },
  {
    keywords: [
      'oud al muteena 1', 'oudalmuteena1', 'al muteena 1', 'muteena1',
      'oud al muteena one'
    ],
    area: 'Oud Al Muteena 1'
  },
  {
    keywords: [
      'al yelayiss 1', 'alyelayiss1', 'yelayiss 1', 'yelayiss1',
      'al yelayiss one', 'yelayiss one'
    ],
    area: 'Al Yelayiss 1'
  },
  {
    keywords: [
      'al yufrah 1', 'alyufrah1', 'yufrah 1', 'yufrah1',
      'al yufrah one', 'yufrah one'
    ],
    area: 'Al Yufrah 1'
  },
  {
    keywords: [
      'world islands', 'the world islands', 'world island'
    ],
    area: 'World Islands'
  },
  {
    keywords: [
      'nad al shiba 1', 'nadalshiba1', 'al shiba 1',
      'nad al shiba one'
    ],
    area: 'Nad Al Shiba 1'
  },
  {
    keywords: [
      'al warqa 1', 'alwarqa1', 'warqa 1', 'warqa1',
      'al warqa one', 'warqa one'
    ],
    area: 'Al Warqa 1'
  },
  {
    keywords: [
      'al wasl', 'alwasl', 'wasl'
    ],
    area: 'Al Wasl'
  },
  {
    keywords: [
      'al khawaneej 2', 'alkhawaneej2', 'khawaneej 2', 'khawaneej2',
      'al khawaneej two', 'khawaneej two'
    ],
    area: 'Al Khawaneej 2'
  },
  {
    keywords: [
      'al ruwayyah', 'alruwayyah', 'ruwayyah'
    ],
    area: 'Al Ruwayyah'
  },
  {
    keywords: [
      'nad al shiba 4', 'nadalshiba4', 'shiba 4', 'shiba4',
      'nad al shiba four'
    ],
    area: 'Nad Al Shiba 4'
  },
  {
    keywords: [
      'al warqa third', 'alwarqathird', 'warqa third'
    ],
    area: 'Al Warqa Third'
  },
  {
    keywords: [
      'al yufrah 2', 'alyufrah2', 'yufrah 2', 'yufrah2',
      'al yufrah two', 'yufrah two'
    ],
    area: 'Al Yufrah 2'
  },
  {
    keywords: [
      'al twar 3', 'altwar3', 'twar 3', 'twar3',
      'al twar three', 'twar three'
    ],
    area: 'Al Twar 3'
  },
  {
    keywords: [
      'al kifaf', 'alkifaf', 'kifaf'
    ],
    area: 'Al Kifaf'
  },
  {
    keywords: [
      'hor al anz', 'horalanza', 'hor anz', 'al anz'
    ],
    area: 'Hor Al Anz'
  },
  {
    keywords: [
      'al satwa', 'alsatwa', 'satwa'
    ],
    area: 'Al Satwa'
  },
  {
    keywords: [
      'al mizhar 2', 'almizhar2', 'mizhar 2', 'mizhar2',
      'al mizhar two', 'mizhar two'
    ],
    area: 'Al Mizhar 2'
  },
  {
    keywords: [
      'al khairan', 'alkhairan', 'khairan'
    ],
    area: 'Al Khairan'
  },
  {
    keywords: [
      'al garhoud', 'algarhoud', 'garhoud'
    ],
    area: 'Al Garhoud'
  },
  {
    keywords: [
      'al nahda 2', 'alnahda2', 'nahda 2', 'nahda2',
      'al nahda two'
    ],
    area: 'Al Nahda 2'
  },
  {
    keywords: [
      'oud metha', 'oudmetha', 'metha'
    ],
    area: 'Oud Metha'
  },
  {
    keywords: [
      'saih shuaib 1', 'saihshuaib1', 'shuaib 1', 'shuaib1',
      'saih shuaib one'
    ],
    area: 'Saih Shuaib 1'
  },
  {
    keywords: [
      'wadi al amardi', 'wadialamardi', 'amardi', 'al amardi'
    ],
    area: 'Wadi Al Amardi'
  },
  {
    keywords: [
      'nad al shiba', 'nadalshiba', 'al shiba'
    ],
    area: 'Nad Al Shiba'
  },
  {
    keywords: [
      'al barsha south 1', 'albarshasouth1', 'barsha south 1', 'barshasouth1',
      'al barsha south one', 'barsha south one'
    ],
    area: 'Al Barsha South 1'
  },
  {
    keywords: [
      'al bada', 'albada', 'bada'
    ],
    area: 'Al Bada'
  },
  {
    keywords: [
      'warsan 4', 'warsan4'
    ],
    area: 'Warsan 4'
  },
  {
    keywords: [
      'ras al khor industrial 1', 'rasalkhorindustrial1',
      'khor industrial 1', 'industrial area 1'
    ],
    area: 'Ras Al Khor Industrial 1'
  },
  {
    keywords: [
      'trade center 2', 'tradecenter2', 'trade centre 2', 'tradecentre2',
      'trade center two'
    ],
    area: 'Trade Center 2'
  },
  {
    keywords: [
      'naif', 'al naif', 'naiff'
    ],
    area: 'Naif'
  },
  {
    keywords: [
      'al rashidiya', 'alrashidiya', 'rashidiya'
    ],
    area: 'Al Rashidiya'
  },
  {
    keywords: [
      'al hebiah 2', 'alhebiah2', 'hebiah 2', 'hebiah2',
      'al hebiah two'
    ],
    area: 'Al Hebiah 2'
  },
  {
    keywords: [
      'al qouz 2', 'alqouz2', 'al quoz 2', 'alquoz2',
      'qouz 2', 'quoz 2'
    ],
    area: 'Al Qouz 2'
  },
  {
    keywords: [
      'al barsha 2', 'albarsha2', 'barsha 2', 'barsha2',
      'al barsha two', 'barsha two'
    ],
    area: 'Al Barsha 2'
  },
  {
    keywords: [
      'wadi al safa 7', 'wadialsafa7', 'safa 7', 'safa7',
      'wadi al safa seven', 'safa seven'
    ],
    area: 'Wadi Al Safa 7'
  },
  {
    keywords: [
      'al murqabat', 'almurqabat', 'murqabat'
    ],
    area: 'Al Murqabat'
  },
  {
    keywords: [
      'al twar fourth', 'altwarforth', 'twar fourth'
    ],
    area: 'Al Twar Fourth'
  },
  {
    keywords: [
      'jabal ali industrial 2', 'jabalaliindustrial2',
      'jebel ali industrial 2'
    ],
    area: 'Jabal Ali Industrial 2'
  },
  {
    keywords: [
      'muhaisanah 1', 'muhaisnah1', 'muhaisanah one'
    ],
    area: 'Muhaisanah 1'
  },
  {
    keywords: [
      'palm deira', 'palmdeira'
    ],
    area: 'Palm Deira'
  },
  {
    keywords: [
      'al saffa 1', 'alsaffa1', 'saffa 1', 'saffa1',
      'al saffa one'
    ],
    area: 'Al Saffa 1'
  },
  {
    keywords: [
      'al dhagaya', 'aldhagaya', 'dhagaya'
    ],
    area: 'Al Dhagaya'
  },
  {
    keywords: [
      'saih shuaib 4', 'saihshuaib4', 'shuaib 4', 'shuaib4',
      'saih shuaib four'
    ],
    area: 'Saih Shuaib 4'
  },
  {
    keywords: [
      'nad al shiba 3', 'nadalshiba3', 'shiba 3', 'shiba3',
      'nad al shiba three'
    ],
    area: 'Nad Al Shiba 3'
  },
  {
    keywords: [
      'al warqa 2', 'alwarqa2', 'warqa 2', 'warqa2',
      'al warqa two', 'warqa two'
    ],
    area: 'Al Warqa 2'
  },
  {
    keywords: [
      'port saeed', 'portsaeed', 'saeed'
    ],
    area: 'Port Saeed'
  },
  {
    keywords: [
      'al jafliya', 'aljafliya', 'jafliya'
    ],
    area: 'Al Jafliya'
  },
  {
    keywords: [
      'al mizhar 3', 'almizhar3', 'mizhar 3', 'mizhar3',
      'al mizhar three'
    ],
    area: 'Al Mizhar 3'
  },
  {
    keywords: [
      'al qouz industrial 2', 'alqouzindustrial2', 'al quoz industrial 2',
      'alquozindustrial2', 'qouz industrial 2'
    ],
    area: 'Al Qouz Industrial 2'
  },
  {
    keywords: [
      'meaisem 2', 'meaisem2', 'meaisem two'
    ],
    area: 'Meaisem 2'
  },
  {
    keywords: [
      'al warqa 4', 'alwarqa4', 'warqa 4', 'warqa4',
      'al warqa four', 'warqa four'
    ],
    area: 'Al Warqa 4'
  },
  {
    keywords: [
      'al mararr', 'almararr', 'mararr'
    ],
    area: 'Al Mararr'
  },
  {
    keywords: [
      'al qouz 4', 'alqouz4', 'al quoz 4', 'alquoz4',
      'qouz 4', 'quoz 4'
    ],
    area: 'Al Qouz 4'
  },
  {
    keywords: [
      'saih shuaib 2', 'saihshuaib2', 'shuaib 2', 'shuaib2',
      'saih shuaib two'
    ],
    area: 'Saih Shuaib 2'
  },
  {
    keywords: [
      'madinat hind 4', 'madinathind4', 'hind 4', 'hind4',
      'madinat hind four'
    ],
    area: 'Madinat Hind 4'
  },
  {
    keywords: [
      'al qouz 1', 'alqouz1', 'al quoz 1', 'alquoz1',
      'qouz 1', 'quoz 1'
    ],
    area: 'Al Qouz 1'
  },
  {
    keywords: [
      'jabal ali', 'jabalali', 'jebel ali', 'jebeli ali'
    ],
    area: 'Jabal Ali'
  },
  {
    keywords: [
      'al raffa', 'alraffa', 'raffa'
    ],
    area: 'Al Raffa'
  },
  {
    keywords: [
      'al nahda 1', 'alnahda1', 'nahda 1', 'nahda1',
      'al nahda one'
    ],
    area: 'Al Nahda 1'
  },
  {
    keywords: [
      'al aweer 2', 'alaweer2', 'aweer 2', 'aweer2',
      'al aweer two'
    ],
    area: 'Al Aweer 2'
  },
  {
    keywords: [
      'um suqaim 2', 'umsuqaim2', 'um suqeim 2', 'umsuqeim2',
      'um suqaim two'
    ],
    area: 'Um Suqaim 2'
  },
  {
    keywords: [
      'al twar 1', 'altwar1', 'twar 1', 'twar1',
      'al twar one'
    ],
    area: 'Al Twar 1'
  },
  {
    keywords: [
      'island 2', 'island2', 'island two'
    ],
    area: 'Island 2'
  },
  {
    keywords: [
      'jabal ali industrial 1', 'jabalaliindustrial1',
      'jebel ali industrial 1'
    ],
    area: 'Jabal Ali Industrial 1'
  },
  {
    keywords: [
      'al khawaneej 1', 'alkhawaneej1', 'khawaneej 1', 'khawaneej1',
      'al khawaneej one'
    ],
    area: 'Al Khawaneej 1'
  },
  {
    keywords: [
      'al hamriya', 'alhamriya', 'hamriya'
    ],
    area: 'Al Hamriya'
  },
  {
    keywords: [
      'eyal nasser', 'eyalnasser', 'nasser'
    ],
    area: 'Eyal Nasser'
  },
  {
    keywords: [
      'um al sheif', 'umalsheif', 'al sheif', 'sheif'
    ],
    area: 'Um Al Sheif'
  },
  {
    keywords: [
      'sikkat al khail north', 'sikkatalkhailnorth', 'al khail north'
    ],
    area: 'Sikkat Al Khail North'
  },
  {
    keywords: [
      'um suqaim 1', 'umsuqaim1', 'um suqeim 1',
      'umsuqeim1', 'um suqaim one'
    ],
    area: 'Um Suqaim 1'
  },
  {
    keywords: [
      'muhaisanah 3', 'muhaisnah3', 'muhaisanah three'
    ],
    area: 'Muhaisanah 3'
  },
  {
    keywords: [
      'zareeba duviya', 'zareebaduviya', 'duviya'
    ],
    area: 'Zareeba Duviya'
  },
  {
    keywords: [
      'um suqaim', 'umsuqaim', 'um suqeim'
    ],
    area: 'Um Suqaim'
  },
  {
    keywords: [
      'al barsha 1', 'albarsha1', 'barsha 1', 'barsha1',
      'al barsha one'
    ],
    area: 'Al Barsha 1'
  },
  {
    keywords: [
      'al safoh 2', 'alsafoh2', 'safoh 2', 'safoh2',
      'al safoh two'
    ],
    area: 'Al Safoh 2'
  },
  {
    keywords: [
      'al manara', 'almanara', 'manara'
    ],
    area: 'Al Manara'
  },
  {
    keywords: [
      'al khabeesi', 'alkhabeesi', 'khabeesi'
    ],
    area: 'Al Khabeesi'
  },
  {
    keywords: [
      'al mamzer', 'almamzer', 'mamzer'
    ],
    area: 'Al Mamzer'
  },
  {
    keywords: [
      'um hurair 2', 'umhurair2', 'al hurair 2', 'hurair 2',
      'um hurair two'
    ],
    area: 'Um Hurair 2'
  },
  {
    keywords: [
      'al mizhar', 'almizhar', 'mizhar'
    ],
    area: 'Al Mizhar'
  },
  {
    keywords: [
      'al qusais 4', 'alqusais4', 'qusais 4', 'qusais4',
      'al qusais four'
    ],
    area: 'Al Qusais 4'
  },
  {
    keywords: [
      'al ras', 'alras', 'ras'
    ],
    area: 'Al Ras'
  },
  {
    keywords: [
      'al baraha', 'albaraha', 'baraha'
    ],
    area: 'Al Baraha'
  },
  {
    keywords: [
      'saih shuaib 3', 'saihshuaib3', 'shuaib 3', 'shuaib3',
      'saih shuaib three'
    ],
    area: 'Saih Shuaib 3'
  },
  {
    keywords: [
      'al twar 2', 'altwar2', 'twar 2', 'twar2',
      'al twar two'
    ],
    area: 'Al Twar 2'
  },
  {
    keywords: [
      'ras al khor industrial 2', 'rasalkhorindustrial2',
      'khor industrial 2'
    ],
    area: 'Ras Al Khor Industrial 2'
  },
  {
    keywords: [
      'um hurair 1', 'umhurair1', 'al hurair 1', 'hurair1',
      'um hurair one'
    ],
    area: 'Um Hurair 1'
  },
  {
    keywords: [
      'al qusais industrial 5', 'alqusaisindustrial5',
      'qusais industrial 5'
    ],
    area: 'Al Qusais Industrial 5'
  },
  {
    keywords: [
      'nad rashid', 'nadrashid', 'rashid'
    ],
    area: 'Nad Rashid'
  },
  {
    keywords: [
      'al qusais industrial 4', 'alqusaisindustrial4',
      'qusais industrial 4'
    ],
    area: 'Al Qusais Industrial 4'
  },
  {
    keywords: [
      'palm jabal ali', 'palmjabalali', 'palm jebel ali'
    ],
    area: 'Palm Jabal Ali'
  },
  {
    keywords: [
      'al karama', 'alkarama', 'karama'
    ],
    area: 'Al Karama'
  },
  {
    keywords: [
      'hor al anz east', 'horalanzeast', 'al anz east'
    ],
    area: 'Hor Al Anz East'
  },
  {
    keywords: [
      'tawaa al sayegh', 'tawaaalsayegh', 'sayegh'
    ],
    area: 'Tawaa Al Sayegh'
  }
]
[
  {
    keywords: [
      'al ttay', 'alttay', 'ttay'
    ],
    area: 'Al Ttay'
  },
  {
    keywords: [
      'al khawaneej', 'alkhawaneej', 'khawaneej'
    ],
    area: 'Al Khawaneej'
  },
  {
    keywords: [
      'al buteen', 'albuteen', 'buteen'
    ],
    area: 'Al Buteen'
  },
  {
    keywords: [
      'al barsha', 'albarsha', 'barsha'
    ],
    area: 'Al Barsha'
  },
  {
    keywords: [
      'al lusaily', 'allusaily', 'lusaily'
    ],
    area: 'Al Lusaily'
  },
  {
    keywords: [
      'jumeirah 2', 'jumeirah2', 'jumeirah two'
    ],
    area: 'Jumeirah 2'
  },
  {
    keywords: [
      'um ramool', 'umramool', 'ramool'
    ],
    area: 'Um Ramool'
  },
  {
    keywords: [
      'al qusais 2', 'alqusais2', 'qusais 2', 'qusais2',
      'al qusais two'
    ],
    area: 'Al Qusais 2'
  },
  {
    keywords: [
      'al hudaiba', 'alhudaiba', 'hudaiba'
    ],
    area: 'Al Hudaiba'
  },
  {
    keywords: [
      'hessyan 1', 'hessyan1', 'hessyan one'
    ],
    area: 'Hessyan 1'
  },
  {
    keywords: [
      'al qouz 3', 'alqouz3', 'al quoz 3', 'alquoz3',
      'qouz 3', 'quoz 3'
    ],
    area: 'Al Qouz 3'
  },
  {
    keywords: [
      'trade center 1', 'tradecenter1', 'trade centre 1', 'tradecentre1',
      'trade center one'
    ],
    area: 'Trade Center 1'
  },
  {
    keywords: [
      'madinat hind 3', 'madinathind3', 'hind 3', 'hind3',
      'madinat hind three'
    ],
    area: 'Madinat Hind 3'
  },
  {
    keywords: [
      'al warsan 2', 'alwarsan2', 'warsan 2', 'warsan2',
      'al warsan two'
    ],
    area: 'Al Warsan 2'
  },
  {
    keywords: [
      'al safaa', 'alsafaa', 'safaa'
    ],
    area: 'Al Safaa'
  },
  {
    keywords: [
      'muhaisanah 2', 'muhaisnah2', 'muhaisanah two'
    ],
    area: 'Muhaisanah 2'
  },
  {
    keywords: [
      'nad al shiba 2', 'nadalshiba2', 'shiba 2', 'shiba2',
      'nad al shiba two'
    ],
    area: 'Nad Al Shiba 2'
  },
  {
    keywords: [
      'al rega', 'alrega', 'rega'
    ],
    area: 'Al Rega'
  },
  {
    keywords: [
      'al qusais industrial 1', 'alqusaisindustrial1',
      'qusais industrial 1'
    ],
    area: 'Al Qusais Industrial 1'
  },
  {
    keywords: [
      'rega al buteen', 'regaalbuteen', 'al buteen', 'buteen'
    ],
    area: 'Rega Al Buteen'
  },
  {
    keywords: [
      'al qusais', 'alqusais', 'qusais'
    ],
    area: 'Al Qusais'
  },
  {
    keywords: [
      'al-bastakiyah', 'albastakiyah', 'bastakiyah'
    ],
    area: 'Al-Bastakiyah'
  },
  {
    keywords: [
      'mena jabal ali', 'menajabalali', 'mena jebel ali'
    ],
    area: 'Mena Jabal Ali'
  },
  {
    keywords: [
      'saih aldahal', 'saihaldahal', 'aldahal'
    ],
    area: 'Saih Aldahal'
  },
  {
    keywords: [
      'nad shamma', 'nadshamma', 'shamma'
    ],
    area: 'Nad Shamma'
  },
  {
    keywords: [
      'tawi al muraqqab', 'tawialmuraqqab', 'muraqqab'
    ],
    area: 'Tawi Al Muraqqab'
  },
  {
    keywords: [
      'mushrif', 'almushrif'
    ],
    area: 'Mushrif'
  },
  {
    keywords: [
      'ras al khor industrial 3', 'rasalkhorindustrial3',
      'khor industrial 3'
    ],
    area: 'Ras Al Khor Industrial 3'
  },
  {
    keywords: [
      'al muhaisnah north', 'almuhaisnahnorth', 'muhaisnah north'
    ],
    area: 'Al Muhaisnah North'
  },
  {
    keywords: [
      'jumeirah', 'jumeira'
    ],
    area: 'Jumeirah'
  },
  {
    keywords: [
      'bukadra', 'albukadra'
    ],
    area: 'Bukadra'
  },
  {
    keywords: [
      'zaabeel 1', 'zaabeel1', 'zabeel 1', 'zabeel1',
      'zaabeel one'
    ],
    area: 'Zaabeel 1'
  },
  {
    keywords: [
      'al murar qadeem', 'almurarqadeem', 'murar qadeem'
    ],
    area: 'Al Murar Qadeem'
  },
  {
    keywords: [
      'al zarouniyyah', 'alzarouniyyah', 'zarouniyyah'
    ],
    area: 'Al Zarouniyyah'
  },
  {
    keywords: [
      'muragab', 'almuragab'
    ],
    area: 'Muragab'
  },
  {
    keywords: [
      'al qoaz', 'alqoaz', 'qoaz'
    ],
    area: 'Al Qoaz'
  },
  {
    keywords: [
      'lehbab', 'al lehebab', 'lehebab'
    ],
    area: 'Lehbab'
  },
  {
    keywords: [
      'al qouz industrial 1', 'alqouzindustrial1', 'al quoz industrial 1'
    ],
    area: 'Al Qouz Industrial 1'
  },
  {
    keywords: [
      'al sabkha', 'alsabkha', 'sabkha'
    ],
    area: 'Al Sabkha'
  },
  {
    keywords: [
      'margham', 'almargham'
    ],
    area: 'Margham'
  },
  {
    keywords: [
      'muhaisanah 4', 'muhaisnah4', 'muhaisanah four'
    ],
    area: 'Muhaisanah 4'
  },
  {
    keywords: [
      'muhaisna', 'almuhaisna'
    ],
    area: 'Muhaisna'
  },
  {
    keywords: [
      'al warsan 3', 'alwarsan3', 'warsan 3', 'warsan3',
      'al warsan three'
    ],
    area: 'Al Warsan 3'
  },
  {
    keywords: [
      'al qusais industrial 3', 'alqusaisindustrial3',
      'qusais industrial 3'
    ],
    area: 'Al Qusais Industrial 3'
  },
  {
    keywords: [
      'al safiyyah', 'alsafiyyah', 'safiyyah'
    ],
    area: 'Al Safiyyah'
  },
  {
    keywords: [
      'al rowaiyah 3', 'alrowaiyah3', 'rowaiyah 3', 'rowaiyah3',
      'al rowaiyah three'
    ],
    area: 'Al Rowaiyah 3'
  },
  {
    keywords: [
      'madinat hind 1', 'madinathind1', 'hind 1', 'hind1',
      'madinat hind one'
    ],
    area: 'Madinat Hind 1'
  },
  {
    keywords: [
      'al musalla dubai', 'almusalladubai', 'al musalla', 'musalla'
    ],
    area: 'Al Musalla (Dubai)'
  },
  {
    keywords: [
      'al qusais industrial 2', 'alqusaisindustrial2',
      'qusais industrial 2'
    ],
    area: 'Al Qusais Industrial 2'
  },
  {
    keywords: [
      'ras al khor', 'rasalkhor', 'khor'
    ],
    area: 'Ras Al Khor'
  },
  {
    keywords: [
      'al rowaiyah 1', 'alrowaiyah1', 'rowaiyah 1', 'rowaiyah1',
      'al rowaiyah one'
    ],
    area: 'Al Rowaiyah 1'
  },
  {
    keywords: [
      'al murar jadeed', 'almurarjadeed', 'murar jadeed', 'jadeed'
    ],
    area: 'Al Murar Jadeed'
  },
  {
    keywords: [
      'grayteesah', 'algrayteesah'
    ],
    area: 'Grayteesah'
  },
  {
    keywords: [
      'lehbab first', 'lehbabfirst', 'lehbab 1', 'lehbab1',
      'lehbab one'
    ],
    area: 'Lehbab First'
  },
  {
    keywords: [
      'al qouz industrial 4', 'alqouzindustrial4',
      'al quoz industrial 4'
    ],
    area: 'Al Qouz Industrial 4'
  },
  {
    keywords: [
      'al qouz industrial 1', 'alqouzindustrial1',
      'al quoz industrial 1'
    ],
    area: 'Al Qouz Industrial 1'
  },
  {
    keywords: [
      'al eyas', 'aleyas', 'eyas'
    ],
    area: 'Al Eyas'
  },
  {
    keywords: [
      'al asbaq', 'alasbaq', 'asbaq'
    ],
    area: 'Al Asbaq'
  },
  {
    keywords: [
      'jabal ali industrial 3', 'jabalaliindustrial3',
      'jebel ali industrial 3'
    ],
    area: 'Jabal Ali Industrial 3'
  },
  {
    keywords: [
      'al tawar', 'altawar', 'tawar'
    ],
    area: 'Al Tawar'
  },
  {
    keywords: [
      'al yelayiss 5', 'alyelayiss5', 'yelayiss 5', 'yelayiss5',
      'al yelayiss five'
    ],
    area: 'Al Yelayiss 5'
  },
  {
    keywords: [
      'al aweer', 'alaweer', 'aweer'
    ],
    area: 'Al Aweer'
  },
  {
    keywords: [
      'lehbab 2', 'lehbab2', 'lehbab two'
    ],
    area: 'Lehbab 2'
  },
  {
    keywords: [
      'al khairan 2', 'alkhairan2', 'khairan 2', 'khairan2',
      'al khairan two'
    ],
    area: 'Al Khairan 2'
  },
  {
    keywords: [
      'naif north', 'naifnorth', 'north naif'
    ],
    area: 'Naif North'
  },
  {
    keywords: [
      'al riqqa east', 'alriqqaeast', 'riqqa east'
    ],
    area: 'Al Riqqa East'
  },
  {
    keywords: [
      'hessyan 2', 'hessyan2', 'hessyan two'
    ],
    area: 'Hessyan 2'
  },
  {
    keywords: [
      'jabal ali 3', 'jabalali3', 'jebel ali 3', 'jebeli ali 3',
      'jabal ali three'
    ],
    area: 'Jabal Ali 3'
  },
  {
    keywords: [
      'al shumaal', 'alshumaal', 'shumaal'
    ],
    area: 'Al Shumaal'
  },
  {
    keywords: [
      'al souq al kabeer deira', 'alsouqalkabeerdeira',
      'souq al kabeer deira'
    ],
    area: 'Al Souq Al Kabeer (Deira)'
  },
  {
    keywords: [
      'al fahidi', 'alfahidi', 'fahidi'
    ],
    area: 'Al Fahidi'
  },
  {
    keywords: [
      'al baharna', 'albaharna', 'baharna'
    ],
    area: 'Al Baharna'
  },
  {
    keywords: [
      'bur dubai', 'burdubai'
    ],
    area: 'Bur Dubai'
  },
  {
    keywords: [
      'al yelayiss 3', 'alyelayiss3', 'yelayiss 3', 'yelayiss3',
      'al yelayiss three'
    ],
    area: 'Al Yelayiss 3'
  },
  {
    keywords: [
      'hatta', 'al hatta'
    ],
    area: 'Hatta'
  },
  {
    keywords: [
      'dubai international airport', 'dubaiairport', 'airport', 'dx b'
    ],
    area: 'Dubai International Airport'
  },
  {
    keywords: [
      'mugatrah', 'almugatrah'
    ],
    area: 'Mugatrah'
  },
  {
    keywords: [
      'al raulah', 'alraulah', 'raulah'
    ],
    area: 'Al Raulah'
  },
  {
    keywords: [
      'naif south', 'naifsouth'
    ],
    area: 'Naif South'
  },
  {
    keywords: [
      'al maha', 'almaha', 'maha'
    ],
    area: 'Al Maha'
  },
  {
    keywords: [
      'al dzahiyyah al jadeedah', 'aldzahiyyahaljadeedah',
      'dzahiyyah al jadeedah'
    ],
    area: 'Al Dzahiyyah Al Jadeedah'
  },
  {
    keywords: [
      'al nakhal', 'alnakhal', 'nakhal'
    ],
    area: 'Al Nakhal'
  },
  {
    keywords: [
      'burj nahar', 'burjnahar', 'nahar'
    ],
    area: 'Burj Nahar'
  },
  {
    keywords: [
      'al riqqa west', 'alriqqawest', 'riqqa west'
    ],
    area: 'Al Riqqa West'
  },
  {
    keywords: [
      'al layan 1', 'allayan1', 'layan 1', 'layan1',
      'al layan one'
    ],
    area: 'Al Layan 1'
  },
  {
    keywords: [
      'al yelayiss 4', 'alyelayiss4', 'yelayiss 4', 'yelayiss4',
      'al yelayiss four'
    ],
    area: 'Al Yelayiss 4'
  },
  {
    keywords: [
      'al yufrah 4', 'alyufrah4', 'yufrah 4', 'yufrah4',
      'al yufrah four'
    ],
    area: 'Al Yufrah 4'
  },
  {
    keywords: [
      'cornich deira', 'cornichdeira', 'deira corniche'
    ],
    area: 'Cornich Deira'
  },
  {
    keywords: [
      'al mustashfa west', 'almustashfawest', 'mustashfa west'
    ],
    area: 'Al Mustashfa West'
  },
  {
    keywords: [
      'al nahdah', 'alnahdah', 'nahdah'
    ],
    area: 'Al Nahdah'
  },
  {
    keywords: [
      'sikkat al khail south', 'sikkatalkhailsouth', 'al khail south'
    ],
    area: 'Sikkat Al Khail South'
  },
  {
    keywords: [
      'um esalay', 'umesalay', 'esalay'
    ],
    area: 'Um Esalay'
  },
  {
    keywords: [
      'esalal', 'alesalal'
    ],
    area: 'Esalal'
  },
  {
    keywords: [
      'umm addamin', 'ummaddamin', 'addamin'
    ],
    area: 'Umm Addamin'
  },
  {
    keywords: [
      'nazwah', 'alnazwah'
    ],
    area: 'Nazwah'
  },
  {
    keywords: [
      'muashrah al bahraana', 'muashrahalbahraana', 'bahraana'
    ],
    area: 'Muashrah Al Bahraana'
  },
  {
    keywords: [
      'al qiyadah', 'alqiyadah', 'qiyadah'
    ],
    area: 'Al Qiyadah'
  },
  {
    keywords: [
      'shandaghah west', 'shandaghahwest', 'shandaga west'
    ],
    area: 'Shandaghah West'
  },
  {
    keywords: [
      'al marmoom', 'almarmoom', 'marmoom'
    ],
    area: 'Al Marmoom'
  },
  {
    keywords: [
      'al rowaiyah 2', 'alrowaiyah2', 'rowaiyah 2', 'rowaiyah2',
      'al rowaiyah two'
    ],
    area: 'Al Rowaiyah 2'
  },
  {
    keywords: [
      'le hemaira', 'lehemaira', 'hemaira'
    ],
    area: 'Le Hemaira'
  },
  {
    keywords: [
      'madinat hind 2', 'madinathind2', 'hind 2', 'hind2',
      'madinat hind two'
    ],
    area: 'Madinat Hind 2'
  },
  {
    keywords: [
      'al baloosh', 'albaloosh', 'baloosh'
    ],
    area: 'Al Baloosh'
  },
  {
    keywords: [
      'al cornich', 'alcornich', 'cornich'
    ],
    area: 'Al Cornich'
  },
  {
    keywords: [
      'shandaghah east', 'shandaghah east', 'shandagha east'
    ],
    area: 'Shandaghah East'
  },
  {
    keywords: [
      'remah', 'al remah'
    ],
    area: 'Remah'
  },
  {
    keywords: [
      'al musalla deira', 'almusalladeira', 'al musalla', 'musalla'
    ],
    area: 'Al Musalla (Deira)'
  },
  {
    keywords: [
      'festival city 1', 'festivalcity1', 'festival city one'
    ],
    area: 'Festival City 1'
  },
  {
    keywords: [
      'al taway', 'altaway', 'taway'
    ],
    area: 'Al Taway'
  },
  {
    keywords: [
      'al mafraq', 'almafraq', 'mafraq'
    ],
    area: 'Al Mafraq'
  },
  {
    keywords: [
      'al shiha', 'alshiha', 'shiha'
    ],
    area: 'Al Shiha'
  },
  {
    keywords: [
      'al raha', 'alraha', 'raha'
    ],
    area: 'Al Raha'
  },
  {
    keywords: [
      'al thurfa', 'althurfa', 'thurfa'
    ],
    area: 'Al Thurfa'
  },
  {
    keywords: [
      'al huwaylat', 'alhuwaylat', 'huwaylat'
    ],
    area: 'Al Huwaylat'
  },
  {
    keywords: [
      'al laqayem', 'allaqayem', 'laqayem'
    ],
    area: 'Al Laqayem'
  },
  {
    keywords: [
      'al abjar', 'alabjar', 'abjar'
    ],
    area: 'Al Abjar'
  },
  {
    keywords: [
      'al julan', 'aljulan', 'julan'
    ],
    area: 'Al Julan'
  },
  {
    keywords: [
      'al sharq', 'alsharq', 'sharq'
    ],
    area: 'Al Sharq'
  },
  {
    keywords: [
      'al khubaisi', 'alkhubaisi', 'khubaisi'
    ],
    area: 'Al Khubaisi'
  },
  {
    keywords: [
      'al ghuwaifat', 'alghuwaifat', 'ghuwaifat'
    ],
    area: 'Al Ghuwaifat'
  },
  {
    keywords: [
      'al quds', 'alquds', 'quds'
    ],
    area: 'Al Quds'
  },
  {
    keywords: [
      'al waha', 'alwaha', 'waha'
    ],
    area: 'Al Waha'
  },
  {
    keywords: [
      'al marhub', 'almarhub', 'marhub'
    ],
    area: 'Al Marhub'
  },
  {
    keywords: [
      'al hazannah', 'alhazannah', 'hazannah'
    ],
    area: 'Al Hazannah'
  },
  {
    keywords: [
      'al mafraq industrial', 'almafraqindustrial', 'mafraq industrial'
    ],
    area: 'Al Mafraq Industrial'
  },
  {
    keywords: [
      'al zaafranah', 'alzaafranah', 'zaafranah'
    ],
    area: 'Al Zaafranah'
  },
  {
    keywords: [
      'al dissa', 'aldissa', 'dissa'
    ],
    area: 'Al Dissa'
  },
  {
    keywords: [
      'al qudra', 'alqudra', 'qudra'
    ],
    area: 'Al Qudra'
  },
  {
    keywords: [
      'al barari', 'albarari', 'barari'
    ],
    area: 'Al Barari'
  },
  {
    keywords: [
      'al berooj', 'alberooj', 'berooj'
    ],
    area: 'Al Berooj'
  },
  {
    keywords: [
      'saih al salam', 'saihal salam', 'al salam'
    ],
    area: 'Saih Al Salam'
  },
  {
    keywords: [
      'al rawa', 'alrawa', 'rawa'
    ],
    area: 'Al Rawa'
  },
  {
    keywords: [
      'wadi al ameer', 'wadialameer', 'al ameer'
    ],
    area: 'Wadi Al Ameer'
  },
  {
    keywords: [
      'al barsha heights', 'albarshaheights', 'barsha heights', 'tecom'
    ],
    area: 'Al Barsha Heights'
  },
  {
    keywords: [
      'wasl gate', 'waslgate', 'waslgate'
    ],
    area: 'Wasl Gate'
  },
  {
    keywords: [
      'green community east', 'greencommunityeast', 'gce'
    ],
    area: 'Green Community East'
  },
  {
    keywords: [
      'green community west', 'greencommunitywest', 'gcw'
    ],
    area: 'Green Community West'
  },
  {
    keywords: [
      'al furjan', 'alfurjan', 'furjan'
    ],
    area: 'Al Furjan'
  },
  {
    keywords: [
      'ghadeer', 'alghadeer'
    ],
    area: 'Ghadeer'
  },
  {
    keywords: [
      'arabian ranches 2', 'arabianranches2', 'ranches 2', 'ranches2',
      'arabian ranches two'
    ],
    area: 'Arabian Ranches 2'
  },
  {
    keywords: [
      'arabian ranches 3', 'arabianranches3', 'ranches 3', 'ranches3',
      'arabian ranches three'
    ],
    area: 'Arabian Ranches 3'
  },
  {
    keywords: [
      'tilal al ghaf', 'tilalalghaf', 'al ghaf'
    ],
    area: 'Tilal Al Ghaf'
  },
  {
    keywords: [
      'damac hills', 'damachills', 'akoya oxygen'
    ],
    area: 'Damac Hills'
  },
  {
    keywords: [
      'damac hills 2', 'damachills2', 'akoya', 'akoya 2'
    ],
    area: 'Damac Hills 2'
  },
  {
    keywords: [
      'mudon', 'almudon'
    ],
    area: 'Mudon'
  },
  {
    keywords: [
      'town square', 'townsquare'
    ],
    area: 'Town Square'
  },
  {
    keywords: [
      'layan 2', 'layan2', 'layan two'
    ],
    area: 'Layan 2'
  },
  {
    keywords: [
      'barsha south', 'barshasouth', 'al barsha south'
    ],
    area: 'Barsha South'
  },
  {
    keywords: [
      'jumeirah park', 'jumeirahpark'
    ],
    area: 'Jumeirah Park'
  },
  {
    keywords: [
      'jumeirah islands', 'jumeirahislands', 'jumeira islands'
    ],
    area: 'Jumeirah Islands'
  },
  {
    keywords: [
      'the gardens', 'thegardens'
    ],
    area: 'The Gardens'
  },
  {
    keywords: [
      'discovery gardens south', 'discoverygardenssouth',
      'gardens south'
    ],
    area: 'Discovery Gardens South'
  },
  {
    keywords: [
      'discovery gardens north', 'discoverygardensnorth',
      'gardens north'
    ],
    area: 'Discovery Gardens North'
  },
  {
    keywords: [
      'remraam', 'alremraam'
    ],
    area: 'Remraam'
  },
  {
    keywords: [
      'motor city hills', 'motorcityhills'
    ],
    area: 'Motor City Hills'
  },
  {
    keywords: [
      'sports city north', 'sportscitynorth'
    ],
    area: 'Sports City North'
  },
  {
    keywords: [
      'sports city south', 'sportscitysouth'
    ],
    area: 'Sports City South'
  },
  {
    keywords: [
      'dso north', 'dsonorth', 'silicon oasis north'
    ],
    area: 'Silicon Oasis North'
  },
  {
    keywords: [
      'dso south', 'dsosouth', 'silicon oasis south'
    ],
    area: 'Silicon Oasis South'
  },
  {
    keywords: [
      'international city phase 2', 'internationalcityphase2',
      'ic phase 2'
    ],
    area: 'International City Phase 2'
  },
  {
    keywords: [
      'international city west', 'internationalcitywest'
    ],
    area: 'International City West'
  },
  {
    keywords: [
      'international city east', 'internationalcityeast'
    ],
    area: 'International City East'
  },
  {
    keywords: [
      'academic city north', 'academiccitynorth'
    ],
    area: 'Academic City North'
  },
  {
    keywords: [
      'academic city south', 'academiccitysouth'
    ],
    area: 'Academic City South'
  },
  {
    keywords: [
      'dubai hills estate north', 'dubahillsestatenorth',
      'hills estate north'
    ],
    area: 'Dubai Hills Estate North'
  },
  {
    keywords: [
      'dubai hills estate south', 'dubaihillsestatesouth',
      'hills estate south'
    ],
    area: 'Dubai Hills Estate South'
  },
  {
    keywords: [
      'the meadows north', 'themeadowsnorth'
    ],
    area: 'The Meadows North'
  },
  {
    keywords: [
      'the meadows south', 'themeadowssouth'
    ],
    area: 'The Meadows South'
  },
  {
    keywords: [
      'the lakes north', 'thelakesnorth'
    ],
    area: 'The Lakes North'
  },
  {
    keywords: [
      'the lakes south', 'thelakessouth'
    ],
    area: 'The Lakes South'
  },
  {
    keywords: [
      'the greens east', 'thegreenseast'
    ],
    area: 'The Greens East'
  },
  {
    keywords: [
      'the greens west', 'thegreenswest'
    ],
    area: 'The Greens West'
  },
  {
    keywords: [
      'mirdif south', 'mirdifsouth'
    ],
    area: 'Mirdif South'
  },
  {
    keywords: [
      'mirdif north', 'mirdifnorth'
    ],
    area: 'Mirdif North'
  },
  {
    keywords: [
      'al rashidiya north', 'alrashidiyanorth'
    ],
    area: 'Al Rashidiya North'
  },
  {
    keywords: [
      'al rashidiya south', 'alrashidiyasouth'
    ],
    area: 'Al Rashidiya South'
  },
  {
    keywords: [
      'jvc district 10', 'jvcdistrict10', 'district 10', 'district10'
    ],
    area: 'JVC District 10'
  },
  {
    keywords: [
      'jvc district 11', 'jvcdistrict11', 'district 11', 'district11'
    ],
    area: 'JVC District 11'
  },
  {
    keywords: [
      'jvc district 12', 'jvcdistrict12', 'district 12', 'district12'
    ],
    area: 'JVC District 12'
  },
  {
    keywords: [
      'jvt district 7', 'jvtdistrict7', 'district 7', 'district7'
    ],
    area: 'JVT District 7'
  },
  {
    keywords: [
      'jvt district 8', 'jvtdistrict8'
    ],
    area: 'JVT District 8'
  },
  {
    keywords: [
      'jvt district 9', 'jvtdistrict9'
    ],
    area: 'JVT District 9'
  },
  {
    keywords: [
      'al quoz extension', 'alquozextension', 'quoz extension'
    ],
    area: 'Al Quoz Extension'
  },
  {
    keywords: [
      'al quoz industrial zone', 'alquozindustrialzone'
    ],
    area: 'Al Quoz Industrial Zone'
  },
  {
    keywords: [
      'al quoz creative zone', 'alquozcreativezone', 'creative zone'
    ],
    area: 'Al Quoz Creative Zone'
  },
  {
    keywords: [
      'nad al sheba gardens', 'nadal shebagardens', 'sheba gardens'
    ],
    area: 'Nad Al Sheba Gardens'
  },
  {
    keywords: [
      'nad al sheba villas', 'nadal shebavillas', 'sheba villas'
    ],
    area: 'Nad Al Sheba Villas'
  },
  {
    keywords: [
      'nad al sheba 5', 'nadalshiba5', 'shiba 5', 'shiba5',
      'nad al sheba five'
    ],
    area: 'Nad Al Sheba 5'
  },
  {
    keywords: [
      'al khail gate phase 1', 'alkhailgatephase1',
      'khail gate 1'
    ],
    area: 'Al Khail Gate Phase 1'
  },
  {
    keywords: [
      'al khail gate phase 2', 'alkhailgatephase2',
      'khail gate 2'
    ],
    area: 'Al Khail Gate Phase 2'
  },
  {
    keywords: [
      'jumeirah village triangle south', 'jumeirahvillagetrianglesouth'
    ],
    area: 'JVT South'
  },
  {
    keywords: [
      'jumeirah village triangle north', 'jumeirahvillagetrianglenorth'
    ],
    area: 'JVT North'
  },
  {
    keywords: [
      'discovery gardens pavilion', 'discoverygardenspavilion'
    ],
    area: 'Discovery Gardens Pavilion'
  },
  {
    keywords: [
      'dubai production city', 'dubaiproductioncity', 'impz'
    ],
    area: 'Dubai Production City (IMPZ)'
  },
  {
    keywords: [
      'dubai science park', 'dubaisciencepark', 'science park'
    ],
    area: 'Dubai Science Park'
  },
  {
    keywords: [
      'dubai studio city', 'dubaistudiocity', 'studio city'
    ],
    area: 'Dubai Studio City'
  },
  {
    keywords: [
      'umm nahad', 'ummnahad', 'nahad'
    ],
    area: 'Umm Nahad'
  },
  {
    keywords: [
      'umm nahad 1', 'ummnahad1', 'nahad 1'
    ],
    area: 'Umm Nahad 1'
  },
  {
    keywords: [
      'umm nahad 2', 'ummnahad2', 'nahad 2'
    ],
    area: 'Umm Nahad 2'
  },
  {
    keywords: [
      'umm nahad 3', 'ummnahad3', 'nahad 3'
    ],
    area: 'Umm Nahad 3'
  },
  {
    keywords: [
      'umm nahad 4', 'ummnahad4', 'nahad 4'
    ],
    area: 'Umm Nahad 4'
  },
  {
    keywords: [
      'al ruwayyah south', 'alruwayyahsouth', 'ruwayyah south'
    ],
    area: 'Al Ruwayyah South'
  },
  {
    keywords: [
      'al ruwayyah north', 'alruwayyahnorth', 'ruwayyah north'
    ],
    area: 'Al Ruwayyah North'
  },
  {
    keywords: [
      'al lehaima', 'allehaima', 'lehaima'
    ],
    area: 'Al Lehaima'
  },
  {
    keywords: [
      'al aweer farms', 'alaweerfarms', 'aweer farms'
    ],
    area: 'Al Aweer Farms'
  },
  {
    keywords: [
      'al aweer 3', 'alaweer3', 'aweer 3', 'aweer3',
      'al aweer three'
    ],
    area: 'Al Aweer 3'
  },
  {
    keywords: [
      'al aweer 4', 'alaweer4', 'aweer 4', 'aweer4',
      'al aweer four'
    ],
    area: 'Al Aweer 4'
  },
  {
    keywords: [
      'al aweer 5', 'alaweer5', 'aweer 5', 'aweer5',
      'al aweer five'
    ],
    area: 'Al Aweer 5'
  },
  {
    keywords: [
      'al wohoosh', 'alwohoosh', 'wohoosh'
    ],
    area: 'Al Wohoosh'
  },
  {
    keywords: [
      'al muraqqabat south', 'almuraqqabatsouth',
      'muraqqabat south'
    ],
    area: 'Al Muraqqabat South'
  },
  {
    keywords: [
      'al muraqqabat north', 'almuraqqabatnorth',
      'muraqqabat north'
    ],
    area: 'Al Muraqqabat North'
  },
  {
    keywords: [
      'al ramth', 'alramth', 'ramth'
    ],
    area: 'Al Ramth'
  },
  {
    keywords: [
      'al ranim', 'alranim', 'ranim'
    ],
    area: 'Al Ranim'
  },
  {
    keywords: [
      'the sustainable city', 'thesustainablecity', 'sustainable city'
    ],
    area: 'The Sustainable City'
  },
  {
    keywords: [
      'the pulse', 'thepulse', 'pulse residences', 'pulse'
    ],
    area: 'The Pulse'
  },
  {
    keywords: [
      'the pulse villas', 'thepulsevillas', 'pulse villas'
    ],
    area: 'The Pulse Villas'
  },
  {
    keywords: [
      'jebel ali village', 'jebelalivillage'
    ],
    area: 'Jebel Ali Village'
  },
  {
    keywords: [
      'jebel ali hills', 'jebelalihills'
    ],
    area: 'Jebel Ali Hills'
  },
  {
    keywords: [
      'mohammed bin rashid city', 'mbr city', 'mbrcity'
    ],
    area: 'Mohammed Bin Rashid City'
  },
  {
    keywords: [
      'district one', 'district1', 'd1'
    ],
    area: 'District One'
  },
  {
    keywords: [
      'district 7', 'district7', 'mbr district 7'
    ],
    area: 'District 7'
  },
  {
    keywords: [
      'district 11', 'district11', 'mbr district 11'
    ],
    area: 'District 11'
  },
  {
    keywords: [
      'al barsha villas', 'albarshavillas', 'barsha villas'
    ],
    area: 'Al Barsha Villas'
  },
  {
    keywords: [
      'al barsha first', 'albarshafirst', 'barsha first'
    ],
    area: 'Al Barsha First'
  },
  {
    keywords: [
      'al barsha second', 'albarshasecond', 'barsha second'
    ],
    area: 'Al Barsha Second'
  },
  {
    keywords: [
      'al barsha third', 'albarshathird', 'barsha third'
    ],
    area: 'Al Barsha Third'
  },
  {
    keywords: [
      'al barsha south villas', 'albarshasouthvillas',
      'barsha south villas'
    ],
    area: 'Al Barsha South Villas'
  },
  {
    keywords: [
      'the springs 1', 'thesprings1', 'springs 1',
      'springs one'
    ],
    area: 'The Springs 1'
  },
  {
    keywords: [
      'the springs 2', 'thesprings2', 'springs 2',
      'springs two'
    ],
    area: 'The Springs 2'
  },
  {
    keywords: [
      'the springs 3', 'thesprings3', 'springs 3'
    ],
    area: 'The Springs 3'
  },
  {
    keywords: [
      'the springs 4', 'thesprings4', 'springs 4'
    ],
    area: 'The Springs 4'
  },
  {
    keywords: [
      'the springs 5', 'thesprings5', 'springs 5'
    ],
    area: 'The Springs 5'
  },
  {
    keywords: [
      'the springs 6', 'thesprings6', 'springs 6'
    ],
    area: 'The Springs 6'
  },
  {
    keywords: [
      'the springs 7', 'thesprings7', 'springs 7'
    ],
    area: 'The Springs 7'
  },
  {
    keywords: [
      'the springs 8', 'thesprings8', 'springs 8'
    ],
    area: 'The Springs 8'
  },
  {
    keywords: [
      'the springs 9', 'thesprings9', 'springs 9'
    ],
    area: 'The Springs 9'
  },
  {
    keywords: [
      'the springs 10', 'thesprings10', 'springs 10'
    ],
    area: 'The Springs 10'
  },
  {
    keywords: [
      'the springs 11', 'thesprings11', 'springs 11'
    ],
    area: 'The Springs 11'
  },
  {
    keywords: [
      'ghosais industrial 2', 'ghosaisindustrial2',
      'qusais industrial 2'
    ],
    area: 'Ghosais Industrial 2'
  },
  {
    keywords: [
      'ghosais industrial 3', 'ghosaisindustrial3',
      'qusais industrial 3'
    ],
    area: 'Ghosais Industrial 3'
  },
  {
    keywords: [
      'ghosais industrial 4', 'ghosaisindustrial4'
    ],
    area: 'Ghosais Industrial 4'
  },
  {
    keywords: [
      'ghosais industrial 5', 'ghosaisindustrial5'
    ],
    area: 'Ghosais Industrial 5'
  },
  {
    keywords: [
      'Muhaisnah 5', 'muhaisnah5', 'muhaisanah 5'
    ],
    area: 'Muhaisnah 5'
  },
  {
    keywords: [
      'al hira', 'alhira', 'hira'
    ],
    area: 'Al Hira'
  },
  {
    keywords: [
      'al tawar south', 'altawarsouth', 'tawar south'
    ],
    area: 'Al Tawar South'
  },
  {
    keywords: [
      'al tawar north', 'altawarnorth', 'tawar north'
    ],
    area: 'Al Tawar North'
  },
  {
    keywords: [
      'al mamzar west', 'almamzarwest', 'mamzar west'
    ],
    area: 'Al Mamzar West'
  },
  {
    keywords: [
      'al mamzar east', 'almamzareast', 'mamzar east'
    ],
    area: 'Al Mamzar East'
  },
  {
    keywords: [
      'al majan', 'almajan', 'majan'
    ],
    area: 'Al Majan'
  },
  {
    keywords: [
      'al warqa fifth', 'alwarqafifth', 'warqa fifth'
    ],
    area: 'Al Warqa Fifth'
  },
  {
    keywords: [
      'al barsha central', 'albarshacentral', 'barsha central'
    ],
    area: 'Al Barsha Central'
  },
  {
    keywords: [
      'al wadi', 'alwadi', 'wadi'
    ],
    area: 'Al Wadi'
  },
  {
    keywords: [
      'al thuraya', 'althuraya', 'thuraya'
    ],
    area: 'Al Thuraya'
  },
  {
    keywords: [
      'al shuaib', 'alshuaib', 'shuaib'
    ],
    area: 'Al Shuaib'
  },
  {
    keywords: [
      'al heba', 'alheba', 'heba'
    ],
    area: 'Al Heba'
  },
  {
    keywords: [
      'al farfar', 'alfarfar', 'farfar'
    ],
    area: 'Al Farfar'
  },
  {
    keywords: [
      'al uwaynat', 'aluwaynat', 'uwaynat'
    ],
    area: 'Al Uwaynat'
  },
  {
    keywords: [
      'wadi al heli', 'wadialheli', 'al heli', 'heli'
    ],
    area: 'Wadi Al Heli'
  },
  {
    keywords: [
      'wadi al ameer south', 'wadialameersouth',
      'al ameer south'
    ],
    area: 'Wadi Al Ameer South'
  },
  {
    keywords: [
      'wadi al ameer north', 'wadialameernorth',
      'al ameer north'
    ],
    area: 'Wadi Al Ameer North'
  },
  {
    keywords: [
      'al riyayah', 'alriyayah', 'riyayah'
    ],
    area: 'Al Riyayah'
  },
  {
    keywords: [
      'al ruwais', 'alruwais', 'ruwais'
    ],
    area: 'Al Ruwais'
  },
  {
    keywords: [
      'al shawka', 'alshawka', 'shawka'
    ],
    area: 'Al Shawka'
  },
  {
    keywords: [
      'al batha', 'albatha', 'batha'
    ],
    area: 'Al Batha'
  },
  {
    keywords: [
      'al lahbab industrial', 'allahbabindustrial', 'lahbab industrial'
    ],
    area: 'Al Lahbab Industrial'
  },
  {
    keywords: [
      'al badea', 'albadea', 'badea'
    ],
    area: 'Al Badea'
  },
  {
    keywords: [
      'jebel ali free zone', 'jafza', 'jebelalifreezone'
    ],
    area: 'Jebel Ali Free Zone (JAFZA)'
  },
  {
    keywords: [
      'jafza south', 'jafzasouth'
    ],
    area: 'JAFZA South'
  },
  {
    keywords: [
      'jafza north', 'jafzanorth'
    ],
    area: 'JAFZA North'
  },
  {
    keywords: [
      'al quds housing', 'alqudshousing', 'quds housing'
    ],
    area: 'Al Quds Housing'
  },
  {
    keywords: [
      'al murad', 'almurad', 'murad'
    ],
    area: 'Al Murad'
  },
  {
    keywords: [
      'al qubaisat', 'alqubaisat', 'qubaisat'
    ],
    area: 'Al Qubaisat'
  },
  {
    keywords: [
      'al qouf', 'alqouf', 'qouf'
    ],
    area: 'Al Qouf'
  },
  {
    keywords: [
      'al ghadeer south', 'alghadeersouth', 'ghadeer south'
    ],
    area: 'Al Ghadeer South'
  },
  {
    keywords: [
      'al ghadeer north', 'alghadeernorth', 'ghadeer north'
    ],
    area: 'Al Ghadeer North'
  },
  {
    keywords: [
      'al rawiyah', 'alrawiyah', 'rawiyah'
    ],
    area: 'Al Rawiyah'
  },
  {
    keywords: [
      'al jawhara', 'aljawhara', 'jawhara'
    ],
    area: 'Al Jawhara'
  },
  {
    keywords: [
      'al erat', 'alerat', 'erat'
    ],
    area: 'Al Erat'
  },
  {
    keywords: [
      'al darari', 'aldarari', 'darari'
    ],
    area: 'Al Darari'
  },
  {
    keywords: [
      'al qudra farms', 'alqudrafarms', 'qudra farms'
    ],
    area: 'Al Qudra Farms'
  },
  {
    keywords: [
      'al qudra lake', 'alqudralake', 'qudra lake'
    ],
    area: 'Al Qudra Lake'
  },
  {
    keywords: [
      'al wasl dome', 'alwasldome', 'wasl dome'
    ],
    area: 'Al Wasl Dome'
  },
  {
    keywords: [
      'dubailand', 'dubai land'
    ],
    area: 'Dubailand'
  },
  {
    keywords: [
      'the oasis', 'theoasis', 'oasis community'
    ],
    area: 'The Oasis'
  },
  {
    keywords: [
      'serena villas', 'serenavillas', 'serena'
    ],
    area: 'Serena Villas'
  },
  {
    keywords: [
      'villanova', 'villa nova'
    ],
    area: 'Villanova'
  },
  {
    keywords: [
      'amaranta', 'amaranta community'
    ],
    area: 'Amaranta'
  },
  {
    keywords: [
      'la rosa', 'larosa', 'la rosa villas'
    ],
    area: 'La Rosa'
  },
  {
    keywords: [
      'al yufrah 5', 'alyufrah5', 'yufrah 5', 'yufrah five'
    ],
    area: 'Al Yufrah 5'
  },
  {
    keywords: [
      'al yelayiss 6', 'alyelayiss6', 'yelayiss 6', 'yelayiss six'
    ],
    area: 'Al Yelayiss 6'
  },
  {
    keywords: [
      'al baraha north', 'albarahanorth', 'baraha north'
    ],
    area: 'Al Baraha North'
  },
  {
    keywords: [
      'al baraha south', 'albarahasouth', 'baraha south'
    ],
    area: 'Al Baraha South'
  },
  {
    keywords: [
      'al barsha 4', 'albarsha4', 'barsha 4', 'barsha four'
    ],
    area: 'Al Barsha 4'
  },
  {
    keywords: [
      'al barsha 5', 'albarsha5', 'barsha 5', 'barsha five'
    ],
    area: 'Al Barsha 5'
  },
  {
    keywords: [
      'the reserve', 'thereserve'
    ],
    area: 'The Reserve'
  },
  {
    keywords: [
      'al waha villas', 'alwahavillas', 'waha villas'
    ],
    area: 'Al Waha Villas'
  },
  {
    keywords: [
      'al reem', 'alreem', 'reem'
    ],
    area: 'Al Reem'
  },
  {
    keywords: [
      'al khawaneej villas', 'alkhawaneejvillas',
      'khawaneej villas'
    ],
    area: 'Al Khawaneej Villas'
  },
  {
    keywords: [
      'al qouz gardens', 'alquozgardens', 'quoz gardens'
    ],
    area: 'Al Qouz Gardens'
  },
  {
    keywords: [
      'al rashidiyah south', 'alrashidiyahsouth',
      'rashidiyah south'
    ],
    area: 'Al Rashidiyah South'
  },
  {
    keywords: [
      'al rashidiyah west', 'alrashidiyahwest',
      'rashidiyah west'
    ],
    area: 'Al Rashidiyah West'
  },
  {
    keywords: [
      'al rashidiyah east', 'alrashidiyahaeast',
      'rashidiyah east'
    ],
    area: 'Al Rashidiyah East'
  }

];

/**
 * Auto-detect area/zone from address string
 * @param {string} address - The delivery address
 * @param {string} currentZone - The current zone value (fallback)
 * @returns {string} - The matched area or current zone
 */
function detectAreaFromAddress(address, currentZone = '') {
  try {
    if (!address || typeof address !== 'string') {
      return currentZone || '';
    }

    const normalizedAddress = address.toLowerCase().trim();

    // Search through area mappings
    for (const mapping of AREA_MAPPINGS) {
      if (!mapping || !mapping.keywords || !Array.isArray(mapping.keywords)) {
        console.warn('Invalid area mapping found:', mapping);
        continue;
      }
      
      for (const keyword of mapping.keywords) {
        if (keyword && typeof keyword === 'string' && normalizedAddress.includes(keyword.toLowerCase())) {
          console.log(`📍 Area detected: "${mapping.area}" from keyword "${keyword}" in address: "${address}"`);
          return mapping.area;
        }
      }
    }

    // No match found, return current zone
    console.log(`📍 No area match found in address: "${address}", keeping current zone: "${currentZone}"`);
    return currentZone || '';
  } catch (error) {
    console.error('Error in detectAreaFromAddress:', error);
    return currentZone || '';
  }
}

// Export at the end to ensure array is fully parsed
export { AREA_MAPPINGS, detectAreaFromAddress };

