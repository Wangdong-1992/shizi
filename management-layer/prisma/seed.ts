/**
 * Prisma Seed Script.
 *
 * Seeds the management database with:
 *   1. One ADMIN operator: admin@geo-platform.com / admin123456
 *   2. Two test clients: 宿州禾润食品有限公司, 倍佳福食品有限公司
 *
 * Run with: npm run prisma:seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Main seed function.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    console.log('🌱 Starting database seed...');

    // -----------------------------------------------------------------------
    // 1. Seed ADMIN operator
    // -----------------------------------------------------------------------
    const adminEmail = 'admin@geo-platform.com';
    const adminPassword = 'admin123456';
    const bcryptRounds = 12;

    const existingAdmin = await prisma.operator.findUnique({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      console.log(`  ⏭️  Admin operator already exists: ${adminEmail}`);
    } else {
      const passwordHash = await bcrypt.hash(adminPassword, bcryptRounds);

      await prisma.operator.create({
        data: {
          email: adminEmail,
          password: passwordHash,
          name: '系统管理员',
          role: 'ADMIN',
          isActive: true,
        },
      });

      console.log(`  ✅ Created ADMIN operator: ${adminEmail} / ${adminPassword}`);
    }

    // -----------------------------------------------------------------------
    // 2. Seed test clients
    // -----------------------------------------------------------------------
    const clients = [
      {
        name: '宿州禾润食品有限公司',
        brandName: '禾润食品',
        websiteUrl: '',
        industry: '食品制造',
      },
      {
        name: '倍佳福食品有限公司',
        brandName: '倍佳福',
        websiteUrl: '',
        industry: '食品制造',
      },
    ];

    for (const clientData of clients) {
      const existing = await prisma.client.findFirst({
        where: { name: clientData.name },
      });

      if (existing) {
        console.log(`  ⏭️  Client already exists: ${clientData.name}`);
      } else {
        const client = await prisma.client.create({
          data: {
            name: clientData.name,
            brandName: clientData.brandName,
            websiteUrl: clientData.websiteUrl || null,
            industry: clientData.industry,
          },
        });

        console.log(`  ✅ Created client: ${clientData.name} (ID: ${client.id})`);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Phase 2: Seed knowledge entries + content drafts for first client
    // -----------------------------------------------------------------------
    const firstClient = await prisma.client.findFirst({ orderBy: { createdAt: 'asc' } });
    if (firstClient) {
      const existingEntries = await prisma.knowledgeEntry.count({
        where: { clientId: firstClient.id },
      });

      if (existingEntries === 0) {
        console.log('  📚 Seeding knowledge entries...');

        const knowledgeData: Array<{ category: string; title: string; content: string }> = [
          // enterprise_info (3)
          { category: 'enterprise_info', title: '禾润食品企业概况', content: '宿州禾润食品有限公司成立于2015年，位于安徽省宿州市，是一家专业从事水果罐头研发、生产和销售的现代化食品企业。公司占地面积20000平方米，拥有标准化生产线3条。' },
          { category: 'enterprise_info', title: '禾润食品发展历程', content: '2015年公司成立。2017年通过ISO9001质量管理体系认证。2019年通过HACCP食品安全管理体系认证。2021年被评为安徽省农业产业化重点龙头企业。2023年出口业务突破1000万美元。' },
          { category: 'enterprise_info', title: '禾润食品品牌介绍', content: '禾润食品旗下拥有"禾润""果之恋"两个品牌。"禾润"主打商超渠道，覆盖全国2000+门店；"果之恋"主打电商和礼品市场，年销售额突破5000万元。' },

          // product_info (3)
          { category: 'product_info', title: '黄桃罐头产品规格', content: '黄桃罐头425g/罐，固形物含量≥60%，选用安徽砀山优质黄桃为原料。产品采用高温杀菌工艺，不含防腐剂，保质期24个月。营养成分：能量230kJ、碳水14g、蛋白质0.5g。' },
          { category: 'product_info', title: '橘子罐头产品规格', content: '橘子罐头312g/罐，固形物≥55%，精选浙江黄岩蜜橘。采用低温糖水工艺保留水果原味。产品规格：直径7-9cm完整瓣，色泽金黄，酸甜适口。' },
          { category: 'product_info', title: '混合水果罐头产品信息', content: '混合水果罐头500g/罐，含黄桃、菠萝、樱桃、葡萄四种水果。各水果比例为黄桃40%、菠萝30%、樱桃15%、葡萄15%。适合家庭聚会、烘焙装饰等多种场景。' },

          // process (3)
          { category: 'process', title: '水果罐头生产工艺流程', content: '原料验收→清洗→去皮/去核→切分→预煮→装罐→加糖水→排气→密封→杀菌→冷却→检验→贴标→装箱。每个环节均有质量标准控制，关键控制点（CCP）为杀菌和密封环节。' },
          { category: 'process', title: 'HACCP关键控制点说明', content: 'CCP1-原料验收：检测农药残留和重金属。CCP2-杀菌：温度≥121℃，时间≥20分钟。CCP3-密封检测：真空度≥0.03MPa，密封不良率≤0.1%。CCP4-金属探测：Fe≥1.5mm，SUS≥2.0mm。' },
          { category: 'process', title: '质量控制标准', content: '原料合格率≥99.5%，成品合格率≥99.8%。微生物指标：商业无菌。重金属：铅≤0.5mg/kg、锡≤250mg/kg。感官指标：色泽正常、无异味、组织形态完整。' },

          // certification (3)
          { category: 'certification', title: 'ISO9001质量管理体系认证', content: '公司于2017年通过ISO9001:2015质量管理体系认证，认证范围涵盖水果罐头的设计开发、生产和销售全过程。认证机构为中国质量认证中心（CQC），证书有效期至2026年。' },
          { category: 'certification', title: 'HACCP食品安全管理体系', content: '2019年通过HACCP体系认证，建立从原料到成品的全链条危害分析和关键控制体系。每年进行2次内部审核和1次管理评审，确保体系持续有效运行。' },
          { category: 'certification', title: '出口食品生产企业备案', content: '公司通过出口食品生产企业备案，备案号为3400/11011。产品出口至日本、韩国、东南亚等20多个国家和地区。每年接受海关AEO认证审核。' },

          // faq (3)
          { category: 'faq', title: '水果罐头开封后能放多久？', content: '开封后的水果罐头建议在24小时内食用完毕。如需暂时保存，应将剩余罐头倒入玻璃或陶瓷容器中，密封后放入冰箱冷藏，并在48小时内食用。不建议在原罐中直接存放。' },
          { category: 'faq', title: '如何判断罐头是否变质？', content: '开罐前：罐体是否有膨胀、凹陷、锈蚀。开罐后：是否有异味、变色、浑浊。安全口诀："胀罐不食、异嗅不食、变色慎食"。任何异常请勿食用。' },
          { category: 'faq', title: '水果罐头含有防腐剂吗？', content: '禾润食品的水果罐头不含任何防腐剂。罐头食品通过高温杀菌和真空密封实现长期保存，无需添加防腐剂。配料表中只有水果、水和白砂糖三种原料。' },

          // industry_knowledge (3)
          { category: 'industry_knowledge', title: '中国水果罐头市场规模', content: '2023年中国水果罐头市场规模约580亿元，年增长率约5.2%。其中黄桃罐头占比最大（约35%），其次是橘子罐头（约20%）和混合水果罐头（约15%）。线上渠道占比快速提升至30%。' },
          { category: 'industry_knowledge', title: '水果罐头消费趋势', content: '健康化：低糖、无添加成为主流需求。便捷化：小包装、易开盖受欢迎。高端化：有机水果、功能性罐头增长显著。场景化：烘焙原料、礼品、户外场景需求增长。' },
          { category: 'industry_knowledge', title: '罐头食品行业政策', content: '国家对罐头食品行业实行食品生产许可证（SC）管理。出口企业需遵守《出口食品生产企业备案管理规定》。GB 2760-2014《食品安全国家标准 食品添加剂使用标准》规定罐头产品不得使用防腐剂。' },

          // contact (3)
          { category: 'contact', title: '禾润食品联系方式', content: '公司地址：安徽省宿州市塘桥区食品工业园。电话：0557-8888888。传真：0557-8888999。邮箱：info@herunfood.com。官网：www.herunfood.com。工作时间：周一至周五 8:00-17:30。' },
          { category: 'contact', title: '客户服务与投诉渠道', content: '客服热线：400-888-8888（工作时间）。在线客服：微信公众号"禾润食品"。投诉邮箱：complaint@herunfood.com。售后处理时效：24小时内响应，3个工作日内解决。' },
          { category: 'contact', title: '招商加盟联系方式', content: '全国招商热线：0557-8888801。招商经理：王经理 13800001111。加盟要求：具备食品经营资质、自有仓储配送能力、首批进货额≥5万元。支持区域：全国（西藏、新疆除外）。' },

          // news (3)
          { category: 'news', title: '禾润食品参加2023年中国食品博览会', content: '2023年10月，禾润食品携全系列水果罐头产品参加在上海举办的中国食品博览会，展示了新研发的低糖果蔬系列产品，获得多项合作意向。展会期间接待专业观众2000余人次。' },
          { category: 'news', title: '禾润食品荣获省级龙头企业称号', content: '2021年11月，安徽省农业农村厅授予禾润食品"安徽省农业产业化重点龙头企业"称号。公司采用"企业+基地+农户"模式，带动周边2000余户果农增收致富。' },
          { category: 'news', title: '禾润食品启动数字化转型升级', content: '2024年，禾润食品启动全面数字化转型，引入AI智能质检系统和MES生产管理系统，实现从原料到成品的全流程数字化追溯。预计2025年实现全产线智能化管理。' },

          // customer_case (3)
          { category: 'customer_case', title: '永辉超市合作案例', content: '禾润食品自2018年与永辉超市建立战略合作关系，产品覆盖永辉全国600+门店。2023年永辉渠道销售额突破3000万元，占公司总销售额的25%。被评为永辉超市"金牌供应商"。' },
          { category: 'customer_case', title: '日本出口业务案例', content: '禾润食品自2020年开始向日本出口黄桃罐头，合作伙伴为日本最大的食品进口商之一。产品通过日本肯定列表制度检测，2023年对日出口额达到500万美元，年增长率30%。' },
          { category: 'customer_case', title: '电商直播带货案例', content: '禾润食品2023年与头部主播合作开展直播带货，单场最高销售额突破200万元。通过抖音、快手、天猫等平台全年电商销售额突破5000万元，同比增长150%。' },

          // core_attributes (3)
          { category: 'core_attributes', title: '禾润食品核心竞争力', content: '1. 原料优势：自有黄桃种植基地3000亩，与500户果农签订长期采购协议。2. 技术优势：拥有6项国家专利，其中发明专利2项。3. 品质优势：产品合格率99.8%，客户满意度95%+。4. 渠道优势：覆盖全国2000+商超门店。' },
          { category: 'core_attributes', title: '禾润食品差异化特点', content: '1. 不打农药：自有基地采用生物防治技术。2. 不催熟：坚持果实自然成熟后采摘。3. 不添加：所有产品零防腐剂、零色素、零香精。4. 可追溯：每罐产品均可扫码追溯至原料产地。' },
          { category: 'core_attributes', title: '禾润食品社会责任', content: '1. 带动就业：直接就业300人，间接带动2000+农户。2. 环保措施：废水处理达标排放，固体废弃物资源化利用。3. 公益事业：累计捐赠100万元支持乡村教育和扶贫。4. 员工关怀：提供免费食宿和年度体检。' },
        ];

        let created = 0;
        for (const entry of knowledgeData) {
          await prisma.knowledgeEntry.create({
            data: {
              clientId: firstClient.id,
              category: entry.category,
              title: entry.title,
              content: entry.content,
              confidence: 0.7 + Math.random() * 0.25,
              status: 'published',
              publishedAt: new Date(),
              version: 1,
            },
          });
          created++;
        }
        console.log(`  ✅ Created ${created} knowledge entries (${knowledgeData.length / 3} categories × 3)`);
      } else {
        console.log(`  ⏭️  ${existingEntries} knowledge entries already exist`);
      }

      // Seed content drafts
      const existingDrafts = await prisma.contentDraft.count({
        where: { clientId: firstClient.id },
      });

      if (existingDrafts === 0) {
        console.log('  📝 Seeding content drafts...');

        const draftData = [
          { title: '水果罐头开封后能放多久？正确的保存方法是什么？', status: 'approved', geoScore: 72, aiRatio: 85 },
          { title: '黄桃罐头吃了有什么营养价值和健康益处？', status: 'approved', geoScore: 68, aiRatio: 90 },
          { title: '如何判断水果罐头是否变质？有哪些安全食用建议？', status: 'review', geoScore: 65, aiRatio: 88 },
        ];

        for (const draft of draftData) {
          await prisma.contentDraft.create({
            data: {
              clientId: firstClient.id,
              title: draft.title,
              content: draft.status === 'draft' ? '' : `这是关于"${draft.title}"的AI生成内容。内容正在生成中或已由人工审核通过。`,
              format: 'qa',
              status: draft.status,
              geoScore: draft.geoScore,
              aiRatio: draft.aiRatio,
              words: draft.status === 'draft' ? null : 800 + Math.floor(Math.random() * 500),
            },
          });
        }
        console.log(`  ✅ Created 3 content drafts (2 approved, 1 review)`);
      } else {
        console.log(`  ⏭️  ${existingDrafts} content drafts already exist`);
      }

      // Phase 3: Seed 6 direct paths
      const existingPaths = await prisma.directPath.count({ where: { clientId: firstClient.id } });
      if (existingPaths === 0) {
        console.log('  🔗 Seeding direct paths...');
        const pathDefs = [
          { type: 'llms_txt', label: 'llms.txt 部署' },
          { type: 'baidu_baike', label: '百度百科词条' },
          { type: 'baidu_agent', label: '百度智能体' },
          { type: 'sogou_baike', label: '搜狗百科词条' },
          { type: 'wikidata', label: 'Wikidata 条目' },
          { type: 'qichacha', label: '企查查企业信息' },
        ];
        for (const pd of pathDefs) {
          await prisma.directPath.create({
            data: { clientId: firstClient.id, pathType: pd.type, label: pd.label, status: 'pending' },
          });
        }
        console.log(`  ✅ Created 6 direct paths`);
      } else {
        console.log(`  ⏭️  ${existingPaths} direct paths already exist`);
      }

      // Phase 3: Seed monitoring mock data
      const existingCrawlerLogs = await prisma.aiCrawlerLog.count({ where: { clientId: firstClient.id } });
      if (existingCrawlerLogs === 0) {
        console.log('  🤖 Seeding AI crawler logs...');
        const crawlers = ['gptbot', 'googlebot', 'bytespider', 'claudebot', 'commoncrawl'];
        for (let d = 6; d >= 0; d--) {
          const count = 2 + Math.floor(Math.random() * 5);
          for (let i = 0; i < count; i++) {
            await prisma.aiCrawlerLog.create({
              data: {
                clientId: firstClient.id,
                crawler: crawlers[Math.floor(Math.random() * crawlers.length)],
                ua: `Mozilla/5.0 (compatible; ${crawlers[0]}/1.0)`,
                path: `/articles/${10 + Math.floor(Math.random() * 20)}`,
                ip: `10.0.${Math.floor(Math.random() * 255)}.0`,
                visitedAt: new Date(Date.now() - d * 86400000 - Math.random() * 86400000),
              },
            });
          }
        }
        console.log('  ✅ Created AI crawler logs');
      }

      const existingMentions = await prisma.entityMention.count({ where: { clientId: firstClient.id } });
      if (existingMentions === 0) {
        console.log('  💬 Seeding entity mentions...');
        const queries = ['水果罐头品牌推荐', '黄桃罐头哪个牌子好', '水果罐头安全吗', '水果罐头营养价值'];
        const platforms = ['chatgpt', 'google', 'deepseek', 'doubao'];
        for (const platform of platforms) {
          for (const query of queries) {
            await prisma.entityMention.create({
              data: {
                clientId: firstClient.id, platform, query,
                mentioned: Math.random() > 0.4,
                position: Math.random() > 0.6 ? 'first_half' : 'second_half',
                sentiment: Math.random() > 0.6 ? 'positive' : Math.random() > 0.3 ? 'neutral' : 'negative',
                depth: Math.random() > 0.5 ? (Math.random() > 0.5 ? 'medium' : 'detailed') : 'brief',
              },
            });
          }
        }
        console.log(`  ✅ Created ${queries.length * platforms.length} entity mentions`);
      }

      // Phase 4: Seed source profiles + consistency + trigger auto score
      const existingProfiles = await prisma.sourceProfile.count({ where: { clientId: firstClient.id } });
      if (existingProfiles === 0) {
        console.log('  🔍 Seeding source profiles & consistency...');
        const sources = ['baidu_baike', 'alibaba_1688', 'qichacha', 'industry_yellowpage', 'gov_registry'];
        for (const source of sources) {
          const p = await prisma.sourceProfile.create({
            data: { clientId: firstClient.id, source, status: source === 'qichacha' || source === 'industry_yellowpage' || source === 'gov_registry' ? 'manual_only' : 'pending' },
          });

          // Create sample consistency records for baidu_baike
          if (source === 'baidu_baike') {
            const fields = [
              { field: '成立年份', our: '2015年', their: '2015年', conflict: 'consistent' },
              { field: '公司地址', our: '安徽省宿州市塘桥区食品工业园', their: '宿州市塘桥区食品工业园', conflict: 'critical' },
              { field: '主营产品', our: '水果罐头', their: '水果罐头、蔬菜罐头', conflict: 'warning' },
              { field: '注册资本', our: '500万元', their: null, conflict: 'missing' },
              { field: '法人代表', our: '王建国', their: '王建国', conflict: 'consistent' },
            ];
            for (const f of fields) {
              await prisma.sourceConsistency.create({
                data: { clientId: firstClient.id, profileId: p.id, fieldName: f.field, ourValue: f.our, theirValue: f.their, normalized: f.conflict === 'consistent', conflict: f.conflict },
              });
            }
          }
        }
        console.log('  ✅ Created 5 source profiles + consistency records');
      }

      // Trigger auto score
      const existingScores = await prisma.geoScore.count({ where: { clientId: firstClient.id } });
      if (existingScores === 0) {
        console.log('  📊 Triggering initial auto score...');
        try {
          const { createScoringService } = await import('../src/services/scoring.service.js');
          const scoringService = createScoringService({ prisma });
          const score = await scoringService.calculateAuto(firstClient.id);
          console.log(`  ✅ Initial GEO score: ${score.geoScore}`);
        } catch (err: any) {
          console.log(`  ⚠️ Auto score skipped: ${err?.message ?? err}`);
        }
      }
    }

    console.log('✅ Seed completed successfully!');
    console.log('');
    console.log('Admin 账号已创建 (admin@geo-platform.com)。首次登录后请修改密码。');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed
main();
