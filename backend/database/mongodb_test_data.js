// MongoDB Test Data - Personalize Me Prints  
  
// 1. SUPPLIERS  
db.suppliers.drop();  
db.suppliers.insertMany([  
{_id:ObjectId(\"507f1f77bcf86cd799439011\"),name:\"Walk-in / Unspecified\",contact:\"\",address:\"\",phone:\"\",isSystem:true,createdAt:ISODate(\"2026-03-11T00:00:00.000Z\")},  
{_id:ObjectId(\"507f1f77bcf86cd799439012\"),name:\"Mug Supplier Manila\",contact:\"Juan Dela Cruz\",address:\"123 Recto Ave, Manila\",phone:\"0917-123-4567\",isSystem:false,createdAt:ISODate(\"2026-03-11T00:00:00.000Z\")}  
]);  
 
// 2. INVENTORY  
db.inventory.drop();  
db.inventory.insertMany([  
{_id:ObjectId(\"507f191e810c19729de860ea\"),name:\"Ceramic\",category:\"Mugs\",stockQty:100,minStockLevel:10,isOnDemand:false,isActive:true,deletedAt:null,supplierId:ObjectId(\"507f1f77bcf86cd799439011\"),supplierName:\"Walk-in / Unspecified\",lastUnitCost:50,averageCost:50,createdAt:ISODate(\"2026-03-11T00:00:00.000Z\"),updatedAt:ISODate(\"2026-03-11T00:00:00.000Z\")},  
{_id:ObjectId(\"507f191e810c19729de860eb\"),name:\"Magic Mug\",category:\"Mugs\",stockQty:50,minStockLevel:5,isOnDemand:false,isActive:true,deletedAt:null,supplierId:ObjectId(\"507f1f77bcf86cd799439012\"),supplierName:\"Mug Supplier Manila\",lastUnitCost:85,averageCost:85,createdAt:ISODate(\"2026-03-11T00:00:00.000Z\"),updatedAt:ISODate(\"2026-03-11T00:00:00.000Z\")},  
{_id:ObjectId(\"507f191e810c19729de860ec\"),name:\"Plain White T-Shirt\",category:\"T-Shirt\",stockQty:200,minStockLevel:20,isOnDemand:false,isActive:true,deletedAt:null,supplierId:ObjectId(\"507f1f77bcf86cd799439013\"),supplierName:\"T-Shirt Printers PH\",lastUnitCost:120,averageCost:120,createdAt:ISODate(\"2026-03-11T00:00:00.000Z\"),updatedAt:ISODate(\"2026-03-11T00:00:00.000Z\")},  
{_id:ObjectId(\"507f191e810c19729de860ed\"),name:\"Custom Sticker (Vinyl)\",category:\"Stickers\",stockQty:0,minStockLevel:0,isOnDemand:true,isActive:true,deletedAt:null,supplierId:ObjectId(\"507f1f77bcf86cd799439011\"),supplierName:\"Walk-in / Unspecified\",lastUnitCost:25,averageCost:25,createdAt:ISODate(\"2026-03-11T00:00:00.000Z\"),updatedAt:ISODate(\"2026-03-11T00:00:00.000Z\")}  
]);  
 
// 3. STOCK_HISTORY  
db.stock_history.drop();  
db.stock_history.insertMany([  
{_id:ObjectId(\"507f191e810c19729de860fa\"),inventoryId:ObjectId(\"507f191e810c19729de860ea\"),supplierId:ObjectId(\"507f1f77bcf86cd799439011\"),quantity:100,remainingQty:100,unitCost:50,totalCost:5000,reason:\"initial\",createdAt:ISODate(\"2026-03-11T00:00:00.000Z\")},  
{_id:ObjectId(\"507f191e810c19729de860fb\"),inventoryId:ObjectId(\"507f191e810c19729de860eb\"),supplierId:ObjectId(\"507f1f77bcf86cd799439012\"),quantity:50,remainingQty:50,unitCost:85,totalCost:4250,reason:\"initial\",createdAt:ISODate(\"2026-03-11T00:00:00.000Z\")},  
{_id:ObjectId(\"507f191e810c19729de860fc\"),inventoryId:ObjectId(\"507f191e810c19729de860ec\"),supplierId:ObjectId(\"507f1f77bcf86cd799439013\"),quantity:200,remainingQty:200,unitCost:120,totalCost:24000,reason:\"initial\",createdAt:ISODate(\"2026-03-11T00:00:00.000Z\")}  
]);  
 
// 4. PRODUCTS  
db.products.drop();  
db.products.insertMany([  
{_id:ObjectId(\"507f191e810c19729de860aa\"),inventoryId:ObjectId(\"507f191e810c19729de860ea\"),name:\"Ceramic Mug\",description:\"11oz Ceramic Mug - Perfect for custom printing\",category:\"Mugs\",subCategoryCode:\"CER\",subCategoryName:\"Ceramic\",tags:[\"mug\",\"ceramic\",\"custom\"],images:[],thumbnail:null,variantGroups:[],combinations:[],priceType:\"fixed\",price:150,flatPrice:150,priceTiers:[],variantPrices:{},trackInventory:true,stock:50,stockStatus:\"in-stock\",isPublished:true,isActive:true,createdAt:ISODate(\"2026-03-11T00:00:00.000Z\"),updatedAt:ISODate(\"2026-03-11T00:00:00.000Z\")},  
{_id:ObjectId(\"507f191e810c19729de860ab\"),inventoryId:ObjectId(\"507f191e810c19729de860eb\"),name:\"Magic Mug\",description:\"Color-changing mug when hot liquid is poured\",category:\"Mugs\",subCategoryCode:\"MAG\",subCategoryName:\"Magic Mug\",tags:[\"mug\",\"magic\",\"color-change\"],images:[],thumbnail:null,variantGroups:[],combinations:[],priceType:\"fixed\",price:250,flatPrice:250,priceTiers:[],variantPrices:{},trackInventory:true,stock:25,stockStatus:\"in-stock\",isPublished:true,isActive:true,createdAt:ISODate(\"2026-03-11T00:00:00.000Z\"),updatedAt:ISODate(\"2026-03-11T00:00:00.000Z\")},  
{_id:ObjectId(\"507f191e810c19729de860ac\"),inventoryId:ObjectId(\"507f191e810c19729de860ec\"),name:\"Custom T-Shirt\",description:\"Plain white t-shirt for silkscreen or DTF printing\",category:\"T-Shirt\",subCategoryCode:\"PLAIN\",subCategoryName:\"Plain White\",tags:[\"tshirt\",\"plain\",\"white\"],images:[],thumbnail:null,variantGroups:[{id:\"vg-1\",name:\"Size\",options:[{id:\"opt-1\",value:\"Small\"},{id:\"opt-2\",value:\"Medium\"},{id:\"opt-3\",value:\"Large\"}]}],combinations:[{id:\"combo-1\",combo:{\"vg-1\":\"Small\"},label:\"Small\"},{id:\"combo-2\",combo:{\"vg-1\":\"Medium\"},label:\"Medium\"},{id:\"combo-3\",combo:{\"vg-1\":\"Large\"},label:\"Large\"}],priceType:\"tiered\",price:null,flatPrice:null,priceTiers:[{id:1,minQty:1,maxQty:10,prices:{\"combo-1\":200,\"combo-2\":200,\"combo-3\":200}},{id:2,minQty:11,maxQty:50,prices:{\"combo-1\":180,\"combo-2\":180,\"combo-3\":180}},{id:3,minQty:51,maxQty:null,prices:{\"combo-1\":150,\"combo-2\":150,\"combo-3\":150}}],variantPrices:{},trackInventory:true,stock:100,stockStatus:\"in-stock\",isPublished:true,isActive:true,createdAt:ISODate(\"2026-03-11T00:00:00.000Z\"),updatedAt:ISODate(\"2026-03-11T00:00:00.000Z\")}  
]); 
