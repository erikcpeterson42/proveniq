// Shapes for the RentCast API responses we consume.
// Verified against developers.rentcast.io — only fields we actually use.

export interface RentCastComparable {
  id?: string
  formattedAddress?: string
  city?: string
  state?: string
  zipCode?: string
  propertyType?: string
  bedrooms?: number
  bathrooms?: number
  squareFootage?: number
  yearBuilt?: number
  price?: number
  listingType?: string
  listedDate?: string
  removedDate?: string
  daysOnMarket?: number
  distance?: number // miles from the subject property
  correlation?: number // 0-1 similarity to the subject property
}

// GET /avm/value — automated valuation for one address.
export interface RentCastAvm {
  price?: number
  priceRangeLow?: number
  priceRangeHigh?: number
  comparables?: RentCastComparable[]
}

// GET /properties — public-record data for one address.
export interface RentCastProperty {
  id?: string
  formattedAddress?: string
  addressLine1?: string
  city?: string
  state?: string
  zipCode?: string
  county?: string
  propertyType?: string
  bedrooms?: number
  bathrooms?: number
  squareFootage?: number
  lotSize?: number
  yearBuilt?: number
  lastSaleDate?: string
  lastSalePrice?: number
  ownerOccupied?: boolean
}

// GET /listings/sale — active/inactive sale listings for an address.
export interface RentCastSaleListing {
  id?: string
  formattedAddress?: string
  status?: string // "Active" | "Inactive"
  price?: number
  listedDate?: string
  removedDate?: string
  daysOnMarket?: number
  mlsName?: string
  mlsNumber?: string
  listingOffice?: { name?: string; phone?: string }
  listingAgent?: { name?: string; phone?: string }
}

// GET /markets — zip-level market statistics.
export interface RentCastMarket {
  zipCode?: string
  saleData?: {
    lastUpdatedDate?: string
    averagePrice?: number
    medianPrice?: number
    averagePricePerSquareFoot?: number
    averageDaysOnMarket?: number
    newListings?: number
    totalListings?: number
  }
}
