<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class TestMongoConnection extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'mongo:test';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Test MongoDB Atlas connection and show existing collections';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('=== MongoDB Atlas Connection Test ===');
        $this->newLine();

        try {
            $connection = DB::connection('mongodb');
            $this->info('✓ Connection established');
            
            $mongoClient = $connection->getMongoClient();
            $this->info('✓ MongoDB Client connected');
            
            $db = $connection->getMongoDB();
            $this->info('✓ Database: ' . $db->getDatabaseName());
            $this->newLine();
            
            $this->info('Collections in database:');
            $this->info('------------------------');
            
            $collections = $db->listCollections();
            $foundAny = false;
            
            foreach ($collections as $collection) {
                $foundAny = true;
                $collectionName = $collection->getName();
                $count = $db->selectCollection($collectionName)->countDocuments();
                $this->line("  • {$collectionName}: {$count} documents");
            }
            
            if (!$foundAny) {
                $this->warn('  No collections found - database is empty');
            }
            
            $this->newLine();
            $this->info('=== Connection Successful! ===');
            
            return 0;
            
        } catch (\Exception $e) {
            $this->error('✗ Connection Failed!');
            $this->error('Error: ' . $e->getMessage());
            $this->error('File: ' . $e->getFile() . ':' . $e->getLine());
            return 1;
        }
    }
}
