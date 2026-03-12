Set f=CreateObject(\"Scripting.FileSystemObject\")  
Set a=f.CreateTextFile(\"backend\test_atlas.php\",True)  
a.Writeline \"<?php\"  
a.Writeline \"require 'vendor/autoload.php';\"  
a.Writeline \"use MongoDB\Client;\"  
a.Writeline \"\"  
a.Writeline \"echo \\\"=== MongoDB Atlas Test ===\n\n\\\";\"  
a.Writeline \"try {\"  
a.Writeline \"    $client = new Client('mongodb+srv://personalizeme_db_admin:personalizeMeforProject@personalizeme.atejdqr.mongodb.net/personalizeme');\"  
a.Writeline \"    $client->admin->command(['ping' => 1]);\"  
a.Writeline \"    echo \\\"SUCCESS - Connected!\n\n\\\";\"  
a.Writeline \"    echo \\\"Database: personalizeme\n\\\";\"  
a.Writeline \"} catch (Exception $e) {\"  
a.Writeline \"    echo \\\"Error: \\\" . $e->getMessage() . \\\"\n\\\";\"  
a.Writeline \"}\"  
a.Close  
