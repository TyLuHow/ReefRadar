<objective>
Build a cloud-native pipeline to transfer MARRS coral reef audio data directly from Figshare to S3, bypassing local machine entirely.

This matters because: The MARRS dataset is ~527GB compressed. Downloading locally then re-uploading wastes time, bandwidth, and requires massive local storage. A cloud-to-cloud transfer is faster, cheaper, and demonstrates AWS data engineering skills.

Budget constraint: This entire pipeline (prompts 015-019) must cost under $20 total. Be aggressive about cost optimization.
</objective>

<context>
Read CLAUDE.md for project conventions.

MARRS Dataset source: UCL Figshare DOI 10.5522/04/29958062
- 45 sites across 5 countries (Australia, Indonesia, Kenya, Maldives, Mexico)
- ~500k 1-minute WAV recordings (16kHz, ~1.83MB each)
- Total: ~527GB compressed, ~1TB uncompressed
- Site codes: H=healthy, D=degraded, R=restored (32-53mo), N=early-restored (<3mo)

Existing infrastructure:
@infrastructure/resources.json - Current AWS resources
@data/embeddings/marrs_sites.json - 45 sites with metadata and file counts

Target S3 bucket: s3://reefradar-2477-audio or new bucket for raw MARRS data
</context>

<research_phase>
Before building, research the optimal approach:

1. **Check Figshare API** - Can we get direct download URLs without authentication?
   - Figshare public datasets often have direct S3-compatible URLs
   - Check if they support range requests for partial downloads

2. **Evaluate transfer options** (pick cheapest):
   - **EC2 spot instance** (~$0.01-0.03/hr for t3.medium) - download and upload
   - **AWS Lambda with /tmp** (512MB-10GB) - for smaller batches
   - **AWS DataSync** - if Figshare supports compatible protocols
   - **SageMaker notebook** - already have ML environment

3. **Calculate costs**:
   - EC2 spot t3.medium: ~$0.01/hr × estimated hours
   - S3 storage: $0.023/GB/month × GB needed
   - Data transfer: Free into AWS, $0.09/GB out
   - We only need ~1-5% of data (smart sampling), so ~5-25GB
</research_phase>

<requirements>

1. **Create data transfer script** that runs on EC2 spot instance:
   - Fetch Figshare manifest/file listing
   - Implement smart sampling: select 100-500 recordings per site (stratified by time of day if metadata available)
   - Download directly to instance, upload to S3 in batches
   - Track progress in DynamoDB or S3 manifest

2. **Infrastructure as code**:
   - EC2 launch template for spot instance (auto-terminate when done)
   - IAM role with minimal S3 permissions
   - User data script to bootstrap and run transfer

3. **Cost controls**:
   - Spot instance with max price cap
   - S3 lifecycle policy to delete after 30 days if needed
   - CloudWatch alarm if costs exceed $5

4. **Output organization in S3**:
   ```
   s3://reefradar-2477-marrs-raw/
   ├── manifest.json           # What was downloaded, from where
   ├── sites/
   │   ├── ind_H1/
   │   │   ├── ind_H1_20220830_060000.wav
   │   │   └── ...
   │   ├── ind_D2/
   │   └── ...
   └── metadata/
       └── sampling_strategy.json  # How files were selected
   ```
</requirements>

<implementation>
Create these files:
- `scripts/marrs_cloud_transfer.py` - Main transfer script
- `infrastructure/ec2_transfer_template.yaml` - CloudFormation or launch template
- `scripts/launch_transfer.sh` - One-command launcher

The transfer script should:
1. Query Figshare API for file URLs
2. Apply sampling strategy (100-500 files per site, diverse timestamps)
3. Stream download → S3 upload (don't store full files locally)
4. Log progress and handle interruptions gracefully
5. Auto-terminate EC2 when complete
</implementation>

<constraints>
- Total data transfer cost must be under $3
- EC2 runtime should be under 2 hours (spot instance ~$0.02-0.06)
- Use streaming where possible to minimize disk usage
- Must work unattended (no manual intervention after launch)
- Smart sampling: we don't need all 500k files, just enough for good classification
</constraints>

<output>
Create/modify files:
- `scripts/marrs_cloud_transfer.py` - Transfer script
- `scripts/launch_transfer.sh` - Launcher
- `infrastructure/ec2_transfer_template.yaml` - EC2 setup (if using CloudFormation)
- `docs/DATA_PIPELINE.md` - Document the pipeline for portfolio

Do NOT run the actual transfer yet - just create the infrastructure.
Output estimated costs at the end.
</output>

<verification>
Before completing:
1. Verify Figshare API access works (test with one file URL)
2. Verify S3 bucket permissions
3. Calculate and display estimated total cost
4. Confirm spot instance pricing in us-east-1
</verification>

<success_criteria>
- Transfer script created and tested with 1 sample file
- Cost estimate under $5 for full smart-sampled transfer
- Infrastructure ready to launch with single command
- Documentation created for portfolio
</success_criteria>
</content>
</invoke>