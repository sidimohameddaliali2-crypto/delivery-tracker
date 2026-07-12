var simplemaps_countrymap_mapdata={
  main_settings: {
    //General settings
		width: "responsive", //or 'responsive'
    background_color: "#FFFFFF",
    background_transparent: "yes",
    border_color: "#ffffff",
    pop_ups: "detect",
    
		//State defaults
		state_description: "State description",
    state_color: "#88A4BC",
    state_hover_color: "#3B729F",
    state_url: "",
    border_size: 1.5,
    all_states_inactive: "no",
    all_states_zoomable: "yes",
    
		//Location defaults
		location_description: "Location description",
    location_url: "",
    location_color: "#FF0067",
    location_opacity: 0.8,
    location_hover_opacity: 1,
    location_size: 25,
    location_type: "square",
    location_image_source: "frog.png",
    location_border_color: "#FFFFFF",
    location_border: 2,
    location_hover_border: 2.5,
    all_locations_inactive: "no",
    all_locations_hidden: "no",
    
		//Label defaults
		label_color: "#ffffff",
    label_hover_color: "#ffffff",
    label_size: 16,
    label_font: "Arial",
    label_display: "auto",
    label_scale: "yes",
    hide_labels: "no",
    hide_eastern_labels: "no",
   
		//Zoom settings
		zoom: "yes",
    manual_zoom: "yes",
    back_image: "no",
    initial_back: "no",
    initial_zoom: "-1",
    initial_zoom_solo: "no",
    region_opacity: 1,
    region_hover_opacity: 0.6,
    zoom_out_incrementally: "yes",
    zoom_percentage: 0.99,
    zoom_time: 0.5,
    
		//Popup settings
		popup_color: "white",
    popup_opacity: 0.9,
    popup_shadow: 1,
    popup_corners: 5,
    popup_font: "12px/1.5 Verdana, Arial, Helvetica, sans-serif",
    popup_nocss: "no",
    
		//Advanced settings
		div: "map",
    auto_load: "yes",
    url_new_tab: "no",
    images_directory: "default",
    fade_time: 0.1,
    link_text: "View Website"
  },
  state_specific: {
    AEAJ: {
      name: "Ajman",
      description: "default",
      color: "default",
      hover_color: "default",
      url: "default"
    },
    AEAZ: {
      name: "Abu Dhabi",
      description: "default",
      color: "default",
      hover_color: "default",
      url: "default"
    },
    AEDU: {
      name: "Dubay",
      description: "default",
      color: "default",
      hover_color: "default",
      url: "default"
    },
    AEFU: {
      name: "Fujayrah",
      description: "default",
      color: "default",
      hover_color: "default",
      url: "default"
    },
    AERK: {
      name: "Ras Al Khaymah",
      description: "default",
      color: "default",
      hover_color: "default",
      url: "default"
    },
    AESH: {
      name: "Sharjah",
      description: "default",
      color: "default",
      hover_color: "default",
      url: "default"
    },
    AEUQ: {
      name: "Umm Al Qaywayn",
      description: "default",
      color: "default",
      hover_color: "default",
      url: "default"
    }
  },
  locations: {
    "0": {
      name: "Abu Dhabi",
      lat: "24.466667",
      lng: "54.366667"
    }
  },
  labels: {
    AEAJ: {
      name: "Ajman",
      parent_id: "AEAJ"
    },
    AEAZ: {
      name: "Abu Dhabi",
      parent_id: "AEAZ"
    },
    AEDU: {
      name: "Dubai",
      parent_id: "AEDU"
    },
    AEFU: {
      name: "Fujayrah",
      parent_id: "AEFU"
    },
    AERK: {
      name: "Ras Al Khaymah",
      parent_id: "AERK"
    },
    AESH: {
      name: "Sharjah",
      parent_id: "AESH"
    },
    AEUQ: {
      name: "Umm Al Qaywayn",
      parent_id: "AEUQ"
    }
  }
};